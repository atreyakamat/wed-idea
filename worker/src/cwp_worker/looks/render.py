"""Applies a look's adjustments to an image.

Works on float RGB arrays in 0-1. Exposure and white balance are applied in
linear light, where they behave like a camera; tone and colour adjustments
in the usual gamma-encoded space, where they behave like an editor's sliders.
"""

from __future__ import annotations

import hashlib

import numpy as np
from PIL import Image, ImageFilter

from .features import hsv, luminance
from .recipes import HUE_BANDS, Look


def to_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0


def to_image(rgb: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")


def srgb_to_linear(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, None)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


# --- Light ------------------------------------------------------------------


def exposure_and_balance(rgb: np.ndarray, ev: float, gains: tuple[float, float, float]) -> np.ndarray:
    """Exposure (stops) and per-channel white-balance gains, in linear light."""
    if ev == 0 and gains == (1.0, 1.0, 1.0):
        return rgb
    lin = srgb_to_linear(rgb) * (2.0**ev) * np.asarray(gains, dtype=np.float32)
    # Roll off anything pushed past white instead of hard clipping.
    lin = np.where(lin > 0.8, 0.8 + (1 - np.exp(-(lin - 0.8) / 0.2)) * 0.2, lin)
    return linear_to_srgb(lin).astype(np.float32)


def temperature_gains(temperature: float, tint: float) -> tuple[float, float, float]:
    """Look-level warm/cool and green/magenta shifts as channel gains."""
    r = 1 + 0.18 * temperature + 0.04 * tint
    g = 1 - 0.08 * tint
    b = 1 - 0.22 * temperature + 0.04 * tint
    return (r, g, b)


# --- Tone -------------------------------------------------------------------


def _with_luminance(rgb: np.ndarray, old: np.ndarray, new: np.ndarray) -> np.ndarray:
    """Changes brightness while keeping each pixel's colour."""
    ratio = np.where(old > 1e-4, new / np.maximum(old, 1e-4), 1.0)
    out = rgb * ratio[..., None]
    # Very bright pixels can't keep their colour ratio inside 0-1: desaturate them toward white instead.
    over = out.max(axis=-1, keepdims=True)
    return np.where(over > 1, new[..., None] + (out - new[..., None]) / np.maximum(over, 1e-4) * (1 - new[..., None]), out)


def tone(rgb: np.ndarray, contrast: float, highlights: float, shadows: float, fade: float) -> np.ndarray:
    lum = luminance(rgb)
    y = lum
    if shadows:
        y = y + shadows * 0.45 * (1 - y) ** 3 * np.sqrt(np.maximum(y, 0)) * 2
    if highlights:
        hi = np.clip((y - 0.45) / 0.55, 0, 1) ** 1.5
        y = y + highlights * 0.35 * hi * (1 - y + 0.15) if highlights > 0 else y + highlights * 0.4 * hi * (y - 0.35)
    if contrast:
        # Smooth S-curve around the midpoint.
        s = np.clip(y, 0, 1)
        curve = s + contrast * 0.6 * s * (1 - s) * (2 * s - 1) * 2
        y = curve
    y = np.clip(y, 0, 1)
    out = _with_luminance(rgb, lum, y)
    if fade:
        out = fade + out * (1 - fade * 1.1)
    return np.clip(out, 0, 1)


def clarity(rgb: np.ndarray, amount: float) -> np.ndarray:
    """Midtone local contrast (a large-radius unsharp mask on luminance)."""
    if not amount:
        return rgb
    lum = luminance(rgb)
    radius = max(2.0, max(lum.shape) * 0.012)
    blurred = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255
    mid = 1 - np.abs(lum - 0.5) * 2  # strongest in the midtones
    new = np.clip(lum + amount * 0.8 * (lum - blurred) * mid, 0, 1)
    return np.clip(_with_luminance(rgb, lum, new), 0, 1)


# --- Colour -----------------------------------------------------------------


def colour(rgb: np.ndarray, saturation: float, vibrance: float, hsl: dict[str, tuple[float, float]]) -> np.ndarray:
    if not (saturation or vibrance or hsl):
        return rgb
    lum = luminance(rgb)[..., None]
    chroma = rgb - lum
    h, s, _ = hsv(rgb)
    scale = np.full(s.shape, 1 + saturation, dtype=np.float32)
    if vibrance:
        skin = np.exp(-(((h - 25 + 180) % 360 - 180) / 18) ** 2) * (s < 0.6)
        scale = scale + vibrance * (1 - s) * (1 - 0.6 * skin)
    lift = np.zeros(s.shape, dtype=np.float32)
    for band, (sat, light) in hsl.items():
        centre = HUE_BANDS[band]
        weight = np.exp(-(((h - centre + 180) % 360 - 180) / 28) ** 2) * np.clip(s * 2.5, 0, 1)
        scale = scale + sat * weight
        lift = lift + light * 0.25 * weight
    out = lum + chroma * np.maximum(scale, 0)[..., None]
    out = out + lift[..., None] * (1 - out) * (lift[..., None] > 0) + lift[..., None] * out * (lift[..., None] < 0)
    return np.clip(out, 0, 1)


def split_tone(rgb: np.ndarray, shadows: tuple[float, float, float], highlights: tuple[float, float, float]) -> np.ndarray:
    if not any(shadows) and not any(highlights):
        return rgb
    lum = luminance(rgb)[..., None]
    out = rgb + np.asarray(shadows, dtype=np.float32) * (1 - lum) ** 2 * 2 + np.asarray(highlights, dtype=np.float32) * lum**2 * 2
    return np.clip(out, 0, 1)


def mono(rgb: np.ndarray, mix: tuple[float, float, float]) -> np.ndarray:
    weights = np.asarray(mix, dtype=np.float32) / sum(mix)
    grey = (rgb * weights).sum(axis=-1, keepdims=True)
    return np.repeat(grey, 3, axis=-1)


# --- Glow, haze, grain, vignette -------------------------------------------


def _blur(rgb: np.ndarray, radius: float, scale: int = 4) -> np.ndarray:
    """Gaussian blur, done on a smaller copy for speed (large radii only)."""
    h, w = rgb.shape[:2]
    small = to_image(rgb).resize((max(1, w // scale), max(1, h // scale)), Image.Resampling.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(max(0.5, radius / scale)))
    return to_array(small.resize((w, h), Image.Resampling.BILINEAR))


def glow(rgb: np.ndarray, amount: float, radius: float) -> np.ndarray:
    """Soft bloom around bright areas: the 'dreamy, glowy' shine."""
    if not amount:
        return rgb
    lum = luminance(rgb)[..., None]
    bright = rgb * np.clip((lum - 0.55) / 0.45, 0, 1) ** 1.5
    bloom = _blur(bright, max(rgb.shape[:2]) * radius)
    out = 1 - (1 - rgb) * (1 - bloom * amount * 1.4)  # screen
    return np.clip(out, 0, 1)


def soften(rgb: np.ndarray, amount: float) -> np.ndarray:
    """Overall soft-focus haze (an Orton-style blend that keeps detail)."""
    if not amount:
        return rgb
    hazy = _blur(rgb, max(rgb.shape[:2]) * 0.008, scale=2)
    lighter = np.maximum(rgb, hazy)
    return np.clip(rgb * (1 - amount * 0.5) + lighter * amount * 0.5, 0, 1)


def vignette(rgb: np.ndarray, amount: float) -> np.ndarray:
    if not amount:
        return rgb
    h, w = rgb.shape[:2]
    y, x = np.ogrid[:h, :w]
    d = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2) / np.sqrt(2)
    mask = np.clip((d - 0.45) / 0.55, 0, 1) ** 2
    if amount > 0:
        return rgb * (1 - amount * 0.55 * mask)[..., None]
    return 1 - (1 - rgb) * (1 + amount * 0.55 * mask)[..., None]


def grain(rgb: np.ndarray, amount: float, seed_from: bytes) -> np.ndarray:
    """Film grain, strongest in the midtones. Same photo, same grain."""
    if not amount:
        return rgb
    seed = int.from_bytes(hashlib.sha256(seed_from).digest()[:8], "little")
    noise = np.random.default_rng(seed).normal(0, 1, rgb.shape[:2]).astype(np.float32)
    lum = luminance(rgb)
    strength = amount * 0.06 * (1 - np.abs(lum - 0.5) * 1.4)
    return np.clip(rgb + (noise * strength)[..., None], 0, 1)


def apply_look(rgb: np.ndarray, look: Look, strength: float = 1.0, seed: bytes = b"") -> np.ndarray:
    """Applies a look's adjustments (after the automatic fix). strength 0-1 blends it in."""
    base = rgb
    out = exposure_and_balance(rgb, look.exposure, temperature_gains(look.temperature, look.tint))
    out = tone(out, look.contrast, look.highlights, look.shadows, 0.0)
    out = clarity(out, look.clarity)
    if look.mono:
        out = mono(out, look.mono)
    else:
        out = colour(out, look.saturation, look.vibrance, look.hsl)
        out = split_tone(out, look.split_shadows, look.split_highlights)
    out = glow(out, look.glow, look.glow_radius)
    out = soften(out, look.soften)
    if look.fade:
        out = np.clip(look.fade + out * (1 - look.fade * 1.1), 0, 1)
    out = vignette(out, look.vignette)
    out = grain(out, look.grain, seed or str(rgb.shape).encode())
    if strength < 1:
        out = base * (1 - strength) + out * strength
    return out.astype(np.float32)
