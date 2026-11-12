"""Writes the looks engine's numbers for the website's copy of the engine.

The browser runs the same 25 looks (src/lib/looks/) so a photographer can
swap a photo's look instantly and photos dropped into the browser are
edited too. This file is the single source: run it after changing a look,
the lighting model or the fix targets.

    python tools/export_looks.py            # src/lib/looks/engine-data.json
    python tools/export_looks.py --fixtures # also the parity test fixtures
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker" / "src"))

from cwp_worker.looks import engine, lighting  # noqa: E402
from cwp_worker.looks import lighting_model as model  # noqa: E402
from cwp_worker.looks.features import measure  # noqa: E402
from cwp_worker.looks.recipes import DEFAULT_LOOK, HUE_BANDS, LOOKS  # noqa: E402
from cwp_worker.looks.render import apply_look, to_image  # noqa: E402

DATA = ROOT / "src" / "lib" / "looks" / "engine-data.json"
FIXTURES = ROOT / "src" / "lib" / "looks" / "parity.fixture.json"


def engine_data() -> dict:
    looks = []
    for look in LOOKS:
        d = asdict(look)
        d["split_shadows"] = list(look.split_shadows)
        d["split_highlights"] = list(look.split_highlights)
        d["hsl"] = {k: list(v) for k, v in look.hsl.items()}
        d["mono"] = list(look.mono) if look.mono else None
        looks.append(d)
    return {
        "looks": looks,
        "defaultLook": DEFAULT_LOOK,
        "hueBands": HUE_BANDS,
        "targetMedian": engine.TARGET_MEDIAN,
        "maxEv": engine.MAX_EV,
        "maxDarken": engine.MAX_DARKEN,
        "unsureFamily": engine.UNSURE_FAMILY,
        "unsureStrength": engine.UNSURE_STRENGTH,
        "styleBonus": engine.STYLE_BONUS,
        "family": lighting.FAMILY,
        "reasons": lighting._REASONS,  # noqa: SLF001
        "guardProbability": lighting.GUARD_PROBABILITY,
        "model": {"mean": list(model.MEAN), "scale": list(model.SCALE), "weights": [list(r) for r in model.WEIGHTS], "bias": list(model.BIAS)},
    }


def render_data() -> str:
    return json.dumps(engine_data(), indent=1, sort_keys=True) + "\n"


# --- Parity fixtures: small synthetic scenes and what the Python engine makes of them.


def _scene(kind: str, w: int = 32, h: int = 24) -> np.ndarray:
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    rgb = np.zeros((h, w, 3), dtype=np.float32)
    if kind == "daylight":
        rgb[...] = (0.35, 0.6, 0.25)  # lawn
        rgb[: h // 3] = (0.45, 0.65, 0.95)  # sky
        rgb[h // 3 : 2 * h // 3, w // 3 : 2 * w // 3] = (0.85, 0.62, 0.5)  # skin
        rgb += (x / w * 0.1)[..., None]
    elif kind == "golden":
        rgb[...] = (0.75, 0.5, 0.28)
        rgb += ((h - y) / h * 0.25)[..., None] * np.array((1.0, 0.7, 0.3), dtype=np.float32)
        rgb[h // 4 : h // 2, w // 2 : w // 2 + 5] = (1.0, 0.95, 0.8)  # sun
    else:  # stage
        rgb[...] = (0.04, 0.03, 0.06)
        rgb[3:7, 4:10] = (0.9, 0.1, 0.85)
        rgb[3:6, 20:27] = (0.1, 0.95, 0.8)
        rgb[13:20, 12:19] = (0.7, 0.45, 0.4)
    return np.clip(rgb, 0, 1)


def _b64(rgb: np.ndarray) -> str:
    return base64.b64encode((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()).decode()


def fixtures() -> dict:
    out = []
    for kind in ("daylight", "golden", "stage"):
        rgb = (np.asarray(to_image(_scene(kind)), dtype=np.float32)) / 255  # quantised like a real photo
        image = to_image(rgb)
        f = measure(image)
        light = lighting.classify(f)
        renders = {}
        # Every look on the first scene; each scene's own five on the others.
        for look in LOOKS if not out else [lk for lk in LOOKS if lk.group == light.group]:
            fix = engine.plan_fix(f, light.group, look.keep_cast)
            fixed = engine.apply_fix(rgb, fix)
            renders[look.id] = _b64(apply_look(fixed, look.with_(grain=0.0)))
        out.append(
            {
                "kind": kind,
                "width": rgb.shape[1],
                "height": rgb.shape[0],
                "pixels": _b64(rgb),
                "features": {k: v for k, v in f.as_dict().items() if k not in ("iso", "exposure_time")},
                "lighting": {"group": light.group, "scores": light.scores},
                "lookScores": engine.score_looks(f, light.group),
                "renders": renders,
            }
        )
    return {"scenes": out}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fixtures", action="store_true")
    args = parser.parse_args()
    DATA.write_text(render_data())
    print(f"Wrote {DATA.relative_to(ROOT)}")
    if args.fixtures:
        FIXTURES.write_text(json.dumps(fixtures(), separators=(",", ":")) + "\n")
        print(f"Wrote {FIXTURES.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
