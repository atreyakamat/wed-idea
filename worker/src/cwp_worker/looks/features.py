"""Measures what the light in a photo is like.

All measurements are taken on a small copy (long edge 384 px), so they're
quick and don't depend on the camera's resolution.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from PIL import Image

SAMPLE_EDGE = 384

# EXIF tags that help tell flash and low light apart.
EXIF_IFD = 0x8769
FLASH = 0x9209
ISO = 0x8827
EXPOSURE_TIME = 0x829A


@dataclass(frozen=True)
class Features:
    brightness: float  # mean luminance, 0-1
    median: float
    p05: float
    p95: float
    contrast: float  # p95 - p05
    clipped_highlights: float  # share of pixels near white
    dark_share: float  # share of pixels below 0.15
    warmth: float  # red / blue balance of the midtones; 1.0 is neutral
    tint: float  # green vs magenta; 0 is neutral
    saturation: float  # mean HSV saturation
    neon_share: float  # strongly coloured bright pixels (stage lights)
    highlight_warmth: float  # red / blue of the brightest 5%
    sky_share: float  # bright blue in the top third
    green_share: float  # foliage
    skin_share: float  # skin-coloured pixels
    centre_ratio: float  # centre brightness / edge brightness (flash falloff)
    top_ratio: float  # top-third brightness / bottom-third brightness (open sky above)
    blue_top: float  # any blue in the top third (sky, even dusk)
    warm_highlights: float  # bright pixels that are orange/yellow (sun, bulbs)
    spot_share: float  # small very bright spots on a dark scene (stage lights, lamps)
    flash_fired: bool
    iso: int | None
    exposure_time: float | None

    def as_dict(self) -> dict:
        return asdict(self)


def _small_rgb(image: Image.Image) -> np.ndarray:
    small = image.convert("RGB")
    small.thumbnail((SAMPLE_EDGE, SAMPLE_EDGE), Image.Resampling.BILINEAR)
    return np.asarray(small, dtype=np.float32) / 255.0


def luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Hue in degrees, saturation and value, for an RGB array in 0-1."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(axis=-1)
    c = v - rgb.min(axis=-1)
    s = np.where(v > 0, c / np.maximum(v, 1e-6), 0)
    safe = np.maximum(c, 1e-6)
    h = np.where(v == r, ((g - b) / safe) % 6, np.where(v == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60
    h = np.where(c == 0, 0, h)
    return h, s, v


def _exif(image: Image.Image, exif: Image.Exif | None = None) -> tuple[bool, int | None, float | None]:
    try:
        details = (exif if exif is not None else image.getexif()).get_ifd(EXIF_IFD)
    except Exception:  # noqa: BLE001 - broken EXIF just means "unknown"
        return False, None, None
    flash = details.get(FLASH)
    iso = details.get(ISO)
    exposure = details.get(EXPOSURE_TIME)
    if isinstance(iso, tuple):
        iso = iso[0] if iso else None
    try:
        exposure_s = float(exposure) if exposure is not None else None
    except (TypeError, ValueError, ZeroDivisionError):
        exposure_s = None
    return bool(isinstance(flash, int) and flash & 1), int(iso) if isinstance(iso, (int, float)) else None, exposure_s


def _share(mask: np.ndarray) -> float:
    return float(mask.mean()) if mask.size else 0.0


def measure(image: Image.Image, exif: Image.Exif | None = None) -> Features:
    """Measures a photo. Pass the original's EXIF when `image` is a resized copy."""
    rgb = _small_rgb(image)
    lum = luminance(rgb)
    h, s, v = hsv(rgb)
    p05, median, p95 = (float(x) for x in np.percentile(lum, [5, 50, 95]))

    mid = (lum > 0.12) & (lum < 0.92)
    means = rgb[mid].mean(axis=0) if mid.any() else rgb.reshape(-1, 3).mean(axis=0)
    warmth = float(means[0] / max(means[2], 1e-3))
    tint = float(means[1] - (means[0] + means[2]) / 2)

    top = lum >= np.percentile(lum, 95)
    hi = rgb[top].mean(axis=0) if top.any() else means
    highlight_warmth = float(hi[0] / max(hi[2], 1e-3))

    # Stage colour: saturated magenta/purple/red-pink or green-cyan light. Plain
    # sky blue is left out, so a blue sky isn't mistaken for stage lighting.
    neon = (s > 0.6) & (v > 0.35) & (((h >= 255) | (h <= 10)) | ((h >= 100) & (h <= 185)))
    third = rgb.shape[0] // 3
    sky = (h[:third] >= 190) & (h[:third] <= 240) & (s[:third] > 0.18) & (v[:third] > 0.55)
    green = (h >= 70) & (h <= 160) & (s > 0.25) & (v > 0.15)
    skin = (h >= 5) & (h <= 40) & (s > 0.18) & (s < 0.65) & (v > 0.3)

    hh, ww = lum.shape
    centre = lum[hh // 4 : 3 * hh // 4, ww // 4 : 3 * ww // 4]
    edge_mask = np.ones_like(lum, dtype=bool)
    edge_mask[hh // 6 : 5 * hh // 6, ww // 6 : 5 * ww // 6] = False
    centre_ratio = float(centre.mean() / max(lum[edge_mask].mean(), 1e-3))

    top_l = float(lum[: hh // 3].mean())
    bottom_l = float(lum[2 * hh // 3 :].mean())
    blue_top = _share((h[: hh // 3] >= 185) & (h[: hh // 3] <= 250) & (s[: hh // 3] > 0.15) & (v[: hh // 3] > 0.25))
    bright = lum > 0.7
    warm_hi = _share(bright & (h >= 15) & (h <= 60) & (s > 0.25))
    spot = _share(lum > 0.85) if float(np.mean(lum < 0.15)) > 0.4 else 0.0

    flash, iso, exposure = _exif(image, exif)
    return Features(
        brightness=float(lum.mean()),
        median=median,
        p05=p05,
        p95=p95,
        contrast=p95 - p05,
        clipped_highlights=_share(lum > 0.97),
        dark_share=_share(lum < 0.15),
        warmth=warmth,
        tint=tint,
        saturation=float(s.mean()),
        neon_share=_share(neon),
        highlight_warmth=highlight_warmth,
        sky_share=_share(sky) / 3,
        green_share=_share(green),
        skin_share=_share(skin),
        centre_ratio=centre_ratio,
        top_ratio=top_l / max(bottom_l, 1e-3),
        blue_top=blue_top,
        warm_highlights=warm_hi,
        spot_share=spot,
        flash_fired=flash,
        iso=iso,
        exposure_time=exposure,
    )
