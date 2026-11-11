"""Sorts a photo into one of five kinds of light.

A small linear model over the photo's measurements (see features.py), trained
on labelled photos by tools/train_lighting.py. It is fast, has no extra
dependencies, and can be retrained with a studio's own photos.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from . import lighting_model as model
from .features import Features

GROUPS = ("daylight", "golden", "indoor", "stage", "night")

LIGHTING_LABELS = {
    "daylight": "Daylight",
    "golden": "Golden hour",
    "indoor": "Indoor warm",
    "stage": "Stage / concert",
    "night": "Night / flash",
}

# Groups whose looks suit each other's photos: a mix-up inside a family
# costs little, one across families (a concert look on a beach) costs a lot.
FAMILY = {"daylight": "bright", "golden": "warm", "indoor": "warm", "stage": "dark", "night": "dark"}

_REASONS = {
    "daylight": "even, neutral light",
    "golden": "warm, low sun in the highlights",
    "indoor": "warm artificial light indoors",
    "stage": "strong coloured lights on a dark scene",
    "night": "dark scene or on-camera flash",
}


@dataclass(frozen=True)
class Lighting:
    group: str
    confidence: float  # the model's probability for `group`, 0-1
    scores: dict[str, float]  # probability of every group
    reason: str

    @property
    def label(self) -> str:
        return LIGHTING_LABELS[self.group]

    @property
    def family_confidence(self) -> float:
        """Probability that the photo is at least in the right family."""
        return sum(p for g, p in self.scores.items() if FAMILY[g] == FAMILY[self.group])


def feature_vector(f: Features) -> list[float]:
    """The numbers the model reads, in a fixed order (must match lighting_model.py)."""
    log = lambda x, floor: math.log(max(x, floor))  # noqa: E731
    return [
        f.brightness,
        f.p95,
        log(f.warmth, 0.05),
        log(f.highlight_warmth, 0.05),
        f.dark_share,
        f.saturation,
        min(f.sky_share * 10, 1.0),
        f.clipped_highlights * 10,
        f.skin_share,
        f.green_share,
        f.contrast,
        log(f.centre_ratio, 0.1),
        f.neon_share,
        f.tint * 10,
        log(f.top_ratio, 0.05),
        f.blue_top,
        f.warm_highlights * 5,
        f.spot_share * 20,
        1.0 if f.flash_fired else 0.0,
    ]


def probabilities(f: Features) -> dict[str, float]:
    x = feature_vector(f)
    z = [(v - m) / (s or 1.0) for v, m, s in zip(x, model.MEAN, model.SCALE)]
    logits = [b + sum(zi * row[k] for zi, row in zip(z, model.WEIGHTS)) for k, b in enumerate(model.BIAS)]
    top = max(logits)
    exp = [math.exp(v - top) for v in logits]
    total = sum(exp)
    return {g: e / total for g, e in zip(GROUPS, exp)}


# Plain rules for cases the model has seen too few examples of. Each one only
# raises a group's probability; checked against the labelled set so they
# don't misfire (see tools/train_lighting.py).
def _guards(f: Features) -> tuple[str, str] | None:
    if f.neon_share >= 0.08 and f.dark_share >= 0.35:
        return "stage", "strong coloured stage light on a dark scene"
    if f.blue_top >= 0.35 and f.brightness >= 0.35 and f.dark_share <= 0.15 and f.warmth < 0.9:
        return "daylight", "open blue sky in good light"
    return None


GUARD_PROBABILITY = 0.75


def classify(f: Features) -> Lighting:
    probs = probabilities(f)
    guard = _guards(f)
    if guard and probs[guard[0]] < GUARD_PROBABILITY:
        target = guard[0]
        rest = sum(p for g, p in probs.items() if g != target) or 1.0
        probs = {g: (GUARD_PROBABILITY if g == target else p / rest * (1 - GUARD_PROBABILITY)) for g, p in probs.items()}
    group = max(probs, key=lambda g: probs[g])
    return Lighting(group=group, confidence=round(probs[group], 3), scores={g: round(p, 3) for g, p in probs.items()}, reason=_REASONS[group])
