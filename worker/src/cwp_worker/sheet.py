"""Before/after contact sheets, for judging looks by eye."""

from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

CELL = 360
PAD = 12
LABEL = 34
BG = (246, 241, 235)
INK = (40, 32, 28)


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # pragma: no cover - Pillow < 10.1
        return ImageFont.load_default()


def _fit(image: Image.Image, size: int) -> Image.Image:
    copy = image.copy()
    copy.thumbnail((size, size), Image.Resampling.LANCZOS)
    return copy


def contact_sheet(rows: list[tuple[str, list[tuple[str, Image.Image]]]], title: str = "") -> Image.Image:
    """rows: (row label, [(cell label, image), …]). Each row is one photo."""
    cols = max(len(cells) for _, cells in rows)
    width = PAD + cols * (CELL + PAD)
    head = 48 if title else 0
    height = head + PAD + len(rows) * (CELL + LABEL + LABEL + PAD)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)
    if title:
        draw.text((PAD, 14), title, fill=INK, font=_font(22))
    y = head + PAD
    for row_label, cells in rows:
        draw.text((PAD, y + 6), row_label, fill=INK, font=_font(16))
        y += LABEL
        for i, (label, image) in enumerate(cells):
            x = PAD + i * (CELL + PAD)
            tile = _fit(image, CELL)
            sheet.paste(tile, (x + (CELL - tile.width) // 2, y + (CELL - tile.height) // 2))
            draw.text((x, y + CELL + 6), label, fill=INK, font=_font(15))
        y += CELL + LABEL + PAD
    return sheet
