"""Measure → fix → pick a look → apply it.

    result = edit(image)                       # fully automatic
    result = edit(image, look_id="honey-film") # a chosen look, still auto-fixed
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from PIL import Image

from .features import Features, measure
from .lighting import Lighting, classify
from .recipes import DEFAULT_LOOK, LOOKS_BY_GROUP, Look, get_look
from .render import apply_look, exposure_and_balance, to_array, to_image, tone

# Where the automatic fix aims each kind of light's middle brightness.
TARGET_MEDIAN = {"daylight": 0.46, "golden": 0.42, "indoor": 0.4, "stage": 0.3, "night": 0.32}
MAX_EV = 1.5


@dataclass(frozen=True)
class Fix:
    ev: float
    gains: tuple[float, float, float]
    highlights: float
    shadows: float


# When the model isn't sure which family of light a photo is (daylight / warm
# / dark), it gets the safe default look of its best guess, applied gently,
# so a wrong guess never means a heavy wrong look.
UNSURE_FAMILY = 0.6
UNSURE_STRENGTH = 0.55


@dataclass(frozen=True)
class EditResult:
    image: Image.Image
    features: Features
    lighting: Lighting
    look: Look
    fix: Fix
    look_scores: dict[str, float]
    strength: float


def plan_fix(f: Features, group: str, keep_cast: float) -> Fix:
    """Exposure, white balance and highlight recovery for this photo."""
    target = TARGET_MEDIAN[group]
    # Median in gamma space -> rough stops to reach the target.
    ev = math.log2(max(target, 1e-3) ** 2.2 / max(f.median, 1e-3) ** 2.2)
    # Don't brighten a photo whose highlights are already near white, and
    # leave dark scenes darker than a daylight shot.
    if f.p95 > 0.92 and ev > 0:
        ev *= 0.35
    ev = max(-MAX_EV, min(MAX_EV, ev * 0.75))

    # Grey-world white balance, only partly applied: most scenes have a mood.
    cast = min(1.0, max(0.0, keep_cast))
    r_gain = (1 / max(f.warmth, 0.2)) ** 0.5
    b_gain = max(f.warmth, 0.2) ** 0.5
    r = 1 + (r_gain - 1) * (1 - cast)
    b = 1 + (b_gain - 1) * (1 - cast)
    g = 1 - f.tint * 1.2 * (1 - cast)
    gains = (r, g, b)

    highlights = -min(0.8, f.clipped_highlights * 12 + max(0.0, f.p95 - 0.9) * 2)
    shadows = min(0.5, max(0.0, 0.25 - f.p05) * 1.2) if group not in ("stage", "night") else 0.0
    return Fix(ev=round(ev, 3), gains=tuple(round(x, 4) for x in gains), highlights=round(highlights, 3), shadows=round(shadows, 3))


def apply_fix(rgb: np.ndarray, fix: Fix) -> np.ndarray:
    out = exposure_and_balance(rgb, fix.ev, fix.gains)
    return tone(out, 0.0, fix.highlights, fix.shadows, 0.0)


def _around(value: float, centre: float, width: float) -> float:
    return math.exp(-(((value - centre) / width) ** 2))


def score_looks(f: Features, group: str) -> dict[str, float]:
    """How well each look of the group suits this photo. The default gets a head start."""
    s: dict[str, float] = {look.id: 0.0 for look in LOOKS_BY_GROUP[group]}
    s[DEFAULT_LOOK[group]] = 0.5
    if group == "daylight":
        s["coastal-blue"] += 3.0 * min(f.sky_share / 0.04, 1.0) * (1 - min(f.green_share / 0.4, 1))
        s["garden-green"] += 1.6 * min(f.green_share / 0.35, 1.0)
        s["bright-airy"] += 0.9 * min(f.skin_share / 0.12, 1.0) * _around(f.contrast, 0.55, 0.25)
        s["soft-pastel"] += 0.7 * min(f.skin_share / 0.15, 1.0) * (1 - min(f.saturation / 0.45, 1))
    elif group == "golden":
        s["sunset-pop"] += 1.4 * min(f.sky_share / 0.03, 1.0) * min(f.saturation / 0.4, 1.0)
        s["dreamy-bloom"] += 1.2 * min(f.clipped_highlights / 0.05, 1.0) * min(f.skin_share / 0.1, 1.0)
        s["warm-haze"] += 0.9 * _around(f.contrast, 0.35, 0.15)
        s["honey-film"] += 0.5 * min(f.skin_share / 0.2, 1.0) * (1 - min(f.saturation / 0.5, 1))
    elif group == "indoor":
        s["candlelight"] += 1.4 * min(f.dark_share / 0.45, 1.0) * min(f.highlight_warmth / 1.8, 1.0)
        s["clean-indoor"] += 1.3 * max(0.0, min((f.warmth - 1.55) / 0.5, 1.0))
        s["soft-skin"] += 1.4 * max(0.0, min((f.skin_share - 0.12) / 0.15, 1.0))
        s["moody-amber"] += 0.7 * min(f.dark_share / 0.5, 1.0) * (1 - min(f.skin_share / 0.15, 1))
    elif group == "stage":
        s["neon-night"] += 1.2 * min(f.neon_share / 0.15, 1.0)
        s["club-glow"] += 0.9 * min(f.dark_share / 0.6, 1.0) * min(f.neon_share / 0.1, 1.0)
        s["tamed-colour"] += 1.5 * min(f.skin_share / 0.08, 1.0) * min(f.saturation / 0.55, 1.0)
    elif group == "night":
        # Flash look only for people lit by a flash (or a flash-like bright centre with skin in it).
        flash_like = 1.0 if f.flash_fired else min(max(f.centre_ratio - 1.4, 0) / 1.2, 1.0)
        s["flash-film"] += 1.6 * flash_like * min(f.skin_share / 0.06, 1.0)
        s["dark-rich"] += 0.8 * min(f.saturation / 0.45, 1.0) * (1 - min(f.dark_share / 0.7, 1))
    return {k: round(v, 3) for k, v in s.items()}


def pick_look(f: Features, lighting: Lighting) -> tuple[Look, dict[str, float]]:
    scores = score_looks(f, lighting.group)
    return get_look(max(scores, key=lambda k: scores[k])), scores


def edit(image: Image.Image, look_id: str | None = None, strength: float = 1.0, seed: bytes = b"", exif: Image.Exif | None = None) -> EditResult:
    """Edits a photo. With no look_id, the look is picked from the light."""
    f = measure(image, exif)
    lighting = classify(f)
    if look_id:
        look, scores = get_look(look_id), score_looks(f, lighting.group)
    elif lighting.family_confidence < UNSURE_FAMILY:
        look, scores = get_look(DEFAULT_LOOK[lighting.group]), score_looks(f, lighting.group)
        strength = min(strength, UNSURE_STRENGTH)
    else:
        look, scores = pick_look(f, lighting)
    fix = plan_fix(f, lighting.group, look.keep_cast)
    rgb = apply_fix(to_array(image), fix)
    rgb = apply_look(rgb, look, strength=strength, seed=seed)
    return EditResult(image=to_image(rgb), features=f, lighting=lighting, look=look, fix=fix, look_scores=scores, strength=strength)
