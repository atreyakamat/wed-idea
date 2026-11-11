"""The 25 looks: five for each kind of light.

A look is a recipe of plain photo adjustments, applied after the automatic
fix (exposure, white balance, highlights). Every number here is meant to be
tuned by eye: change one, re-run `cwp-worker edit --sheet`, compare.

Units:
  exposure      stops (+1 = twice as bright)
  temperature   -1 cool … +1 warm (about ±1500 K)
  tint          -1 green … +1 magenta
  contrast      -1 … +1 (S-curve strength)
  highlights    -1 recover … +1 brighten (top tones only)
  shadows       -1 deepen … +1 open up (bottom tones only)
  fade          0 … 0.2 lifts black to grey (matte / film)
  saturation    -1 … +1 (all colours)
  vibrance      -1 … +1 (muted colours more than strong ones, skin protected)
  glow          0 … 1 soft bloom around bright areas (the "dreamy" shine)
  glow_radius   bloom size as a share of the long edge
  soften        0 … 1 overall soft-focus haze
  clarity       -1 … +1 midtone local contrast
  grain         0 … 1 film grain
  vignette      -1 … +1 darken (+) or lighten (-) the corners
  split_*       colour added to shadows / highlights, as (r, g, b) offsets
  hsl           per-colour tweaks: hue band -> (saturation, lightness), -1…+1
  mono          black-and-white, with the channel mix used
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

RGB = tuple[float, float, float]

# Hue bands (degrees) the hsl tweaks can target.
HUE_BANDS = {"red": 0, "orange": 30, "yellow": 55, "green": 115, "aqua": 180, "blue": 220, "purple": 275, "magenta": 320}


@dataclass(frozen=True)
class Look:
    id: str
    name: str
    group: str
    description: str
    exposure: float = 0.0
    temperature: float = 0.0
    tint: float = 0.0
    contrast: float = 0.0
    highlights: float = 0.0
    shadows: float = 0.0
    fade: float = 0.0
    saturation: float = 0.0
    vibrance: float = 0.0
    glow: float = 0.0
    glow_radius: float = 0.02
    soften: float = 0.0
    clarity: float = 0.0
    grain: float = 0.0
    vignette: float = 0.0
    split_shadows: RGB = (0.0, 0.0, 0.0)
    split_highlights: RGB = (0.0, 0.0, 0.0)
    hsl: dict[str, tuple[float, float]] = field(default_factory=dict)
    mono: RGB | None = None
    # Keep more of the scene's own colour cast when auto-fixing white balance
    # (0 = neutralise fully, 1 = leave it).
    keep_cast: float = 0.5

    def with_(self, **changes) -> "Look":
        return replace(self, **changes)


WARM_HI: RGB = (0.035, 0.018, -0.02)
COOL_SH: RGB = (-0.01, 0.0, 0.025)
TEAL_SH: RGB = (-0.025, 0.01, 0.02)

LOOKS: tuple[Look, ...] = (
    # --- Daylight -------------------------------------------------------
    Look("clean-daylight", "Clean Daylight", "daylight", "True colour, a little extra punch. The safe default for daytime.",
         contrast=0.15, highlights=-0.25, shadows=0.2, vibrance=0.2, clarity=0.1, keep_cast=0.2),
    Look("soft-pastel", "Soft Pastel", "daylight", "Light, airy pastels with a gentle matte finish. Great for portraits and decor.",
         exposure=0.15, contrast=-0.15, highlights=-0.3, shadows=0.35, fade=0.06, saturation=-0.15, vibrance=0.1,
         split_highlights=(0.02, 0.01, 0.015), hsl={"orange": (-0.1, 0.08), "green": (-0.3, 0.1)}, glow=0.15, keep_cast=0.3),
    Look("bright-airy", "Bright & Airy", "daylight", "Bright, clean whites and soft shadows: the classic wedding look.",
         exposure=0.35, contrast=-0.1, highlights=-0.4, shadows=0.45, fade=0.03, saturation=-0.08, vibrance=0.15, glow=0.2,
         temperature=0.05, hsl={"orange": (-0.05, 0.1), "green": (-0.25, 0.15)}, keep_cast=0.2),
    Look("garden-green", "Garden Green", "daylight", "Rich, fresh greens for lawns, gardens and outdoor shoots.",
         contrast=0.2, highlights=-0.2, shadows=0.15, vibrance=0.25, hsl={"green": (0.3, -0.05), "yellow": (0.1, 0.0), "aqua": (0.1, 0.0)},
         clarity=0.12, temperature=0.03, keep_cast=0.2),
    Look("coastal-blue", "Coastal Blue", "daylight", "Clear skies and sea blues with warm skin. Beaches and terraces.",
         contrast=0.18, highlights=-0.35, shadows=0.15, vibrance=0.2, hsl={"blue": (0.3, -0.08), "aqua": (0.25, 0.0), "orange": (0.05, 0.05)},
         split_shadows=COOL_SH, clarity=0.1, keep_cast=0.2),
    # --- Golden hour ----------------------------------------------------
    Look("golden-glow", "Golden Glow", "golden", "Warm sun, soft glow, glowing skin. The default for sunset.",
         temperature=0.15, contrast=0.1, highlights=-0.3, shadows=0.25, vibrance=0.15, glow=0.4, glow_radius=0.03,
         split_highlights=WARM_HI, keep_cast=0.75),
    Look("honey-film", "Honey Film", "golden", "Honey tones and gentle grain, like a film camera at sunset.",
         temperature=0.12, contrast=0.12, fade=0.07, saturation=-0.1, hsl={"orange": (0.1, 0.03), "green": (-0.3, -0.05), "blue": (-0.3, 0.0)},
         split_shadows=(0.02, 0.01, -0.01), split_highlights=(0.03, 0.02, -0.02), grain=0.25, vignette=0.15, keep_cast=0.8),
    Look("warm-haze", "Warm Haze", "golden", "Low-contrast warm haze for backlit, dreamy shots.",
         temperature=0.1, contrast=-0.2, highlights=-0.2, shadows=0.35, fade=0.08, glow=0.35, soften=0.25, vibrance=0.05,
         split_highlights=(0.03, 0.015, 0.0), keep_cast=0.8),
    Look("sunset-pop", "Sunset Pop", "golden", "Saturated orange and pink skies with deep contrast.",
         temperature=0.08, contrast=0.3, highlights=-0.4, shadows=0.1, vibrance=0.3, hsl={"orange": (0.15, 0.0), "red": (0.1, 0.0), "magenta": (0.2, 0.0), "blue": (0.15, -0.1)},
         clarity=0.1, vignette=0.15, keep_cast=0.85),
    Look("dreamy-bloom", "Dreamy Bloom", "golden", "Strong bloom and lifted shadows: soft, glowing and romantic.",
         exposure=0.15, temperature=0.1, contrast=-0.1, highlights=-0.25, shadows=0.4, fade=0.05, glow=0.7, glow_radius=0.04, soften=0.2,
         vibrance=0.1, split_highlights=(0.03, 0.01, 0.01), keep_cast=0.75),
    # --- Indoor warm ----------------------------------------------------
    Look("candlelight", "Candlelight", "indoor", "Keeps the warm candle mood with soft glow on the flames.",
         temperature=0.05, contrast=0.12, highlights=-0.3, shadows=0.25, vibrance=0.1, glow=0.35, glow_radius=0.025, vignette=0.2, keep_cast=0.85),
    Look("warm-ivory", "Warm Ivory", "indoor", "Clean, creamy warmth for halls and receptions. The indoor default.",
         exposure=0.1, contrast=0.1, highlights=-0.25, shadows=0.3, vibrance=0.12, split_highlights=(0.015, 0.012, 0.0), glow=0.15, keep_cast=0.45),
    Look("moody-amber", "Moody Amber", "indoor", "Deep amber shadows and rich contrast for evening interiors.",
         contrast=0.3, highlights=-0.2, shadows=-0.05, saturation=-0.05, split_shadows=(0.03, 0.012, -0.015), split_highlights=(0.02, 0.01, -0.01),
         clarity=0.1, vignette=0.3, keep_cast=0.7),
    Look("clean-indoor", "Clean Indoor", "indoor", "Removes the orange bulb cast for true colour indoors.",
         contrast=0.12, highlights=-0.2, shadows=0.25, vibrance=0.15, keep_cast=0.1),
    Look("soft-skin", "Soft Skin", "indoor", "Flattering, smooth skin tones for close portraits indoors.",
         exposure=0.1, contrast=-0.05, highlights=-0.3, shadows=0.3, vibrance=0.05, hsl={"orange": (-0.12, 0.1), "red": (-0.1, 0.05)},
         soften=0.2, glow=0.2, clarity=-0.15, keep_cast=0.45),
    # --- Stage / concert ------------------------------------------------
    Look("neon-night", "Neon Night", "stage", "Electric neon colour with deep blacks.",
         contrast=0.25, highlights=-0.3, shadows=-0.05, vibrance=0.25, hsl={"magenta": (0.2, 0.0), "purple": (0.2, 0.0), "blue": (0.15, 0.05), "aqua": (0.15, 0.05)},
         glow=0.35, glow_radius=0.02, clarity=0.1, vignette=0.15, keep_cast=1.0),
    Look("concert-pop", "Concert Pop", "stage", "Clear, punchy stage shots with recovered highlights. The stage default.",
         contrast=0.2, highlights=-0.5, shadows=0.2, vibrance=0.15, clarity=0.2, glow=0.15, keep_cast=0.9),
    Look("club-glow", "Club Glow", "stage", "Heavy bloom on the lights for a hazy, dancing-in-the-club feel.",
         contrast=0.15, highlights=-0.3, shadows=0.1, vibrance=0.2, glow=0.65, glow_radius=0.035, soften=0.1, vignette=0.2, keep_cast=1.0),
    Look("tamed-colour", "Tamed Colour", "stage", "Calms harsh LED colour on faces so skin looks like skin.",
         contrast=0.12, highlights=-0.45, shadows=0.25, saturation=-0.3, vibrance=0.05, hsl={"magenta": (-0.35, 0.0), "purple": (-0.3, 0.0), "blue": (-0.25, 0.0), "red": (-0.2, 0.0)},
         keep_cast=0.5),
    Look("mono-punch", "Mono Punch", "stage", "High-contrast black and white for performers and crowds.",
         contrast=0.4, highlights=-0.3, shadows=0.05, clarity=0.25, grain=0.3, vignette=0.2, mono=(0.35, 0.45, 0.2), keep_cast=1.0),
    # --- Night / flash --------------------------------------------------
    Look("night-glow", "Night Glow", "night", "Opens up dark scenes a little and blooms the lights. The night default.",
         exposure=0.08, contrast=0.12, highlights=-0.25, shadows=0.18, vibrance=0.12, glow=0.45, glow_radius=0.025,
         split_shadows=(-0.004, 0.0, 0.01), keep_cast=0.75),
    Look("flash-film", "Flash Film", "night", "Direct-flash party look: crisp, warm skin, film grain.",
         temperature=0.05, contrast=0.25, highlights=-0.35, shadows=-0.05, fade=0.04, vibrance=0.1, grain=0.35, vignette=0.25,
         split_highlights=(0.02, 0.01, -0.01), keep_cast=0.4),
    Look("dark-rich", "Dark & Rich", "night", "Deep shadows and rich colour for evenings and fireworks.",
         contrast=0.3, highlights=-0.25, shadows=-0.1, vibrance=0.25, clarity=0.12, vignette=0.25, split_shadows=TEAL_SH, keep_cast=0.7),
    Look("vintage-grain", "Vintage Grain", "night", "Faded, warm, grainy: a disposable-camera night out.",
         temperature=0.08, contrast=0.05, fade=0.1, saturation=-0.2, split_shadows=(0.02, 0.0, 0.03), split_highlights=(0.03, 0.02, -0.02),
         grain=0.5, vignette=0.3, keep_cast=0.6),
    Look("classic-bw", "Classic B&W", "night", "Timeless black and white with soft grain.",
         contrast=0.25, highlights=-0.25, shadows=0.15, clarity=0.1, grain=0.2, vignette=0.15, mono=(0.3, 0.55, 0.15), keep_cast=1.0),
)

LOOKS_BY_ID = {look.id: look for look in LOOKS}
LOOKS_BY_GROUP: dict[str, list[Look]] = {}
for _look in LOOKS:
    LOOKS_BY_GROUP.setdefault(_look.group, []).append(_look)

# The look each kind of light starts from.
DEFAULT_LOOK = {"daylight": "clean-daylight", "golden": "golden-glow", "indoor": "warm-ivory", "stage": "concert-pop", "night": "night-glow"}


def get_look(look_id: str) -> Look:
    try:
        return LOOKS_BY_ID[look_id]
    except KeyError:
        raise KeyError(f"No look called {look_id!r}. Looks: {', '.join(LOOKS_BY_ID)}") from None
