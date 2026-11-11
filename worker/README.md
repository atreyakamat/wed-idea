# cwp-worker

Uploads a shoot's photos from your computer to Cute Wedding Polaroid as they
land: from a camera card, a tethering folder, or a Google Drive / Dropbox
folder synced to the computer. Originals never leave your disk; the app gets
a web-size copy (2400 px) and a thumbnail, with location and camera data
removed.

## Install

Python 3.10 or newer:

```sh
pip install "cwp-worker @ git+https://github.com/atreyakamat/wed-idea#subdirectory=worker"
# iPhone HEIC photos too:
pip install "cwp-worker[heic] @ git+https://github.com/atreyakamat/wed-idea#subdirectory=worker"
```

## Use

1. In the dashboard, open **Photo delivery → Connect a PC**, name the computer
   and run the `cwp-worker login …` command it shows (once).
2. Then either:

```sh
# Keep watching a folder of shoots. Each subfolder becomes a project named
# after it; new photos upload as soon as they stop changing.
cwp-worker watch "~/Google Drive/Shoots"

# Or upload one folder once, into the project with that short name.
cwp-worker upload "~/Pictures/Meera 30th" --project meeras-30th

cwp-worker projects   # list projects and their short names
```

Dropping the same folder again uploads only new files. Plan limits and
access apply: when a project is full, the worker stops that project and says
why.

## Develop

```sh
cd worker
pip install --only-binary :all: --require-hashes -r requirements-dev.lock
python -m pytest
```

`requirements-dev.lock` pins every dependency with hashes (made with
`uv pip compile --python-version 3.10 --generate-hashes --only-binary :all:`
from Pillow, requests and pytest). Regenerate it when you change the
dependencies in `pyproject.toml`.
