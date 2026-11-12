"""Builds the PC app with PyInstaller: a windowed app with the CLI inside.

    python packaging/build.py           # from the worker folder

Output: dist/<APP>/ (Windows, then packed by windows.iss) or dist/<APP>.app (macOS).
"""

from __future__ import annotations

import sys
from pathlib import Path

import PyInstaller.__main__

APP = "Cute Wedding Polaroid"
HERE = Path(__file__).resolve().parent
WORKER = HERE.parent


def main() -> None:
    args = [
        str(HERE / "entry.py"),
        "--name", APP,
        "--windowed",
        "--noconfirm",
        "--clean",
        "--paths", str(WORKER / "src"),
        # The window and the looks engine are imported lazily by the CLI.
        "--hidden-import", "cwp_worker.app",
        "--hidden-import", "cwp_worker.looks",
        "--collect-submodules", "cwp_worker",
        "--distpath", str(WORKER / "dist"),
        "--workpath", str(WORKER / "build"),
        "--specpath", str(WORKER / "build"),
    ]
    if sys.platform == "darwin":
        args += ["--osx-bundle-identifier", "in.cutewedding.pcapp"]
    PyInstaller.__main__.run(args)


if __name__ == "__main__":
    main()
