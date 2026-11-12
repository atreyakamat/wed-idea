"""Turns a camera file into the two JPEGs the app stores.

Matches the browser uploader: a web-size image (2400 px long edge) and a
thumbnail (900 px), both re-encoded so rotation is applied and EXIF (GPS
location included) is dropped. Originals are never changed.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageOps

FULL_LONG_EDGE = 2400
THUMB_LONG_EDGE = 900
FULL_QUALITY = 88
THUMB_QUALITY = 80

# Cameras store local time without a zone. Studios shoot in India.
DEFAULT_OFFSET = timedelta(hours=5, minutes=30)

EXIF_IFD = 0x8769
DATE_TIME_ORIGINAL = 0x9003
OFFSET_TIME_ORIGINAL = 0x9011

try:  # HEIC/HEIF from phones, when the optional extra is installed.
    from pillow_heif import register_heif_opener  # type: ignore[import-not-found]

    register_heif_opener()
    HEIC_SUPPORTED = True
except ImportError:  # pragma: no cover - depends on the environment
    HEIC_SUPPORTED = False


@dataclass(frozen=True)
class Edited:
    full: bytes
    thumb: bytes
    lighting: str
    look: str


@dataclass(frozen=True)
class Prepared:
    full: bytes
    thumb: bytes
    width: int
    height: int
    taken_at: str | None
    edited: Edited | None = None
    tone: str | None = None  # average colour, "#rrggbb", shown while the photo loads


def fit_within(width: int, height: int, long_edge: int) -> tuple[int, int]:
    """Scales width x height down so the long edge fits, never up."""
    if width <= 0 or height <= 0:
        raise ValueError("Image has no size")
    scale = min(1.0, long_edge / max(width, height))
    return max(1, round(width * scale)), max(1, round(height * scale))


def parse_exif_time(value: str | None, offset: str | None = None) -> str | None:
    """'2026:11:08 18:42:07' (+ optional '+05:30') -> ISO time in UTC, or None."""
    if not value:
        return None
    try:
        local = datetime.strptime(value.strip()[:19], "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None
    if local.year < 1990:
        return None
    zone = timezone(DEFAULT_OFFSET)
    if offset:
        try:
            sign = -1 if offset.strip().startswith("-") else 1
            hours, minutes = offset.strip()[1:].split(":")
            zone = timezone(sign * timedelta(hours=int(hours), minutes=int(minutes)))
        except ValueError:
            pass
    return local.replace(tzinfo=zone).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def taken_at(image: Image.Image) -> str | None:
    """When the photo was taken, from EXIF DateTimeOriginal."""
    try:
        exif = image.getexif()
        details = exif.get_ifd(EXIF_IFD)
    except Exception:  # noqa: BLE001 - broken EXIF shouldn't stop an upload
        return None
    value = details.get(DATE_TIME_ORIGINAL)
    offset = details.get(OFFSET_TIME_ORIGINAL)
    return parse_exif_time(value if isinstance(value, str) else None, offset if isinstance(offset, str) else None)


def _encode(image: Image.Image, long_edge: int, quality: int) -> tuple[bytes, int, int]:
    width, height = fit_within(image.width, image.height, long_edge)
    resized = image if (width, height) == image.size else image.resize((width, height), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    # No exif= argument: nothing from the original's metadata is written.
    resized.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue(), width, height


def average_tone(image: Image.Image) -> str:
    """The photo's average colour as "#rrggbb"."""
    r, g, b = image.convert("RGB").resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


def web_size(image: Image.Image, long_edge: int = FULL_LONG_EDGE) -> Image.Image:
    width, height = fit_within(image.width, image.height, long_edge)
    return image if (width, height) == image.size else image.resize((width, height), Image.Resampling.LANCZOS)


def open_upright(path: Path) -> tuple[Image.Image, str | None, Image.Exif]:
    """Opens a photo turned the right way up, in RGB, with its capture time and EXIF.

    The EXIF is only read (camera settings help judge the light); it is never
    written into the files that are uploaded.
    """
    with Image.open(path) as opened:
        when = taken_at(opened)
        exif = opened.getexif()
        image = ImageOps.exif_transpose(opened)
        if image.mode != "RGB":
            image = image.convert("RGB")
        image.load()
    return image, when, exif


def prepare(path: Path, edit: bool = False, look: str | None = None, seed: bytes = b"") -> Prepared:
    """Reads a photo and makes its web-size JPEG and thumbnail, plus an edited pair when asked."""
    image, when, exif = open_upright(path)
    full, width, height = _encode(image, FULL_LONG_EDGE, FULL_QUALITY)
    thumb, _, _ = _encode(image, THUMB_LONG_EDGE, THUMB_QUALITY)
    edited = None
    shown = image
    if edit:
        from .looks import edit as edit_image  # numpy is only needed for editing

        result = edit_image(web_size(image), look_id=look, seed=seed or path.name.encode(), exif=exif)
        edited_full, _, _ = _encode(result.image, FULL_LONG_EDGE, FULL_QUALITY)
        edited_thumb, _, _ = _encode(result.image, THUMB_LONG_EDGE, THUMB_QUALITY)
        edited = Edited(full=edited_full, thumb=edited_thumb, lighting=result.lighting.group, look=result.look.id)
        shown = result.image
    return Prepared(full=full, thumb=thumb, width=width, height=height, taken_at=when, edited=edited, tone=average_tone(shown))
