"""Retrains the lighting model from labelled photos.

    python tools/train_lighting.py                      # the free sample set
    python tools/train_lighting.py --labels my.json     # add your own photos

The labels file is a JSON list of {"id", "lighting", "download" or "path"}.
Downloads are cached outside the repo (~/.cache/cwp-worker/samples). The
script prints how well the model does on photos it wasn't trained on
(leave-one-out), then rewrites src/cwp_worker/looks/lighting_model.py.

Add photos from real shoots: 20 or more per kind of light makes the biggest
difference, especially stage and indoor.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

import numpy as np
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from cwp_worker.looks.features import measure  # noqa: E402
from cwp_worker.looks.lighting import GROUPS, feature_vector  # noqa: E402

CACHE = Path.home() / ".cache" / "cwp-worker" / "samples"
MODEL_FILE = ROOT / "src" / "cwp_worker" / "looks" / "lighting_model.py"
FAMILY = {"daylight": "bright", "golden": "warm", "indoor": "warm", "stage": "dark", "night": "dark"}

# Downloads are only ever made over HTTPS from these photo hosts, redirects
# included, whatever a labels file says. Use "path" for photos on disk.
ALLOWED_HOSTS = {"images.pexels.com", "picsum.photos", "fastly.picsum.photos", "images.unsplash.com"}
MAX_REDIRECTS = 3


def _check_url(url: str) -> str:
    parts = urlparse(url)
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise ValueError(f"Not downloading {url!r}: only https from {', '.join(sorted(ALLOWED_HOSTS))}")
    return url


def download(url: str, session: requests.Session) -> bytes:
    for _ in range(MAX_REDIRECTS + 1):
        r = session.get(_check_url(url), timeout=60, allow_redirects=False)
        if r.is_redirect:
            url = urljoin(url, r.headers["location"])
            continue
        r.raise_for_status()
        return r.content
    raise ValueError(f"Too many redirects for {url!r}")


def load(entry: dict, session: requests.Session) -> Image.Image:
    if "path" in entry:
        return Image.open(entry["path"])
    target = CACHE / f"{Path(str(entry['id'])).name}.jpg"
    if not target.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        target.write_bytes(download(entry["download"], session))
    return Image.open(target)


def train(X: np.ndarray, y: np.ndarray, l2: float, iters: int = 4000, lr: float = 0.3):
    mu, sd = X.mean(0), X.std(0)
    sd = np.where(sd < 1e-3, 1.0, sd)  # a feature that never varies (e.g. no flash photos yet)
    Z = (X - mu) / sd
    W = np.zeros((Z.shape[1], len(GROUPS)))
    b = np.zeros(len(GROUPS))
    Y = np.eye(len(GROUPS))[y]
    for _ in range(iters):
        logits = Z @ W + b
        logits -= logits.max(1, keepdims=True)
        P = np.exp(logits)
        P /= P.sum(1, keepdims=True)
        W -= lr * (Z.T @ (P - Y) / len(y) + l2 * W / len(y))
        b -= lr * (P - Y).mean(0)
    return mu, sd, W, b


def predict(model, X: np.ndarray) -> np.ndarray:
    mu, sd, W, b = model
    return ((X - mu) / sd @ W + b).argmax(1)


def leave_one_out(X: np.ndarray, y: np.ndarray, l2: float) -> tuple[float, float]:
    exact = family = 0
    for i in range(len(y)):
        keep = np.arange(len(y)) != i
        p = predict(train(X[keep], y[keep], l2), X[i : i + 1])[0]
        exact += p == y[i]
        family += FAMILY[GROUPS[p]] == FAMILY[GROUPS[y[i]]]
    return exact / len(y), family / len(y)


def fmt(a: np.ndarray) -> str:
    if a.ndim == 1:
        return "(" + ", ".join(f"{x:.5f}" for x in a) + ",)"
    return "(\n" + "".join(f"    {fmt(row)},\n" for row in a) + ")"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--labels", action="append", default=[str(ROOT / "samples" / "lighting-samples.json")])
    parser.add_argument("--l2", type=float, default=10.0)
    parser.add_argument("--dry-run", action="store_true", help="report accuracy without rewriting the model")
    args = parser.parse_args()

    entries = [e for f in args.labels for e in json.loads(Path(f).read_text(encoding="utf-8"))]
    session = requests.Session()
    session.headers["User-Agent"] = "cwp-worker-train/0.1"
    X, y = [], []
    for e in entries:
        image = load(e, session)
        image.load()
        X.append(feature_vector(measure(image)))
        y.append(GROUPS.index(e["lighting"]))
    X_arr, y_arr = np.array(X), np.array(y)
    exact, family = leave_one_out(X_arr, y_arr, args.l2)
    counts = {g: int((y_arr == i).sum()) for i, g in enumerate(GROUPS)}
    print(f"{len(y)} photos {counts}")
    print(f"Leave-one-out: exact {exact:.0%}, right family (daylight / warm / dark) {family:.0%}")
    if args.dry_run:
        return 0

    mu, sd, W, b = train(X_arr, y_arr, args.l2)
    MODEL_FILE.write_text(
        '"""Lighting model weights. Generated by tools/train_lighting.py; don\'t edit by hand."""\n\n'
        f"# Trained on {len(y)} labelled photos {counts}.\n"
        f"# Leave-one-out accuracy: exact {exact:.0%}, right family {family:.0%}.\n\n"
        f"MEAN = {fmt(mu)}\nSCALE = {fmt(sd)}\nWEIGHTS = {fmt(W)}\nBIAS = {fmt(b)}\n",
        encoding="utf-8",
    )
    print(f"Wrote {MODEL_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
