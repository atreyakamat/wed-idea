"""Finds photos in a folder and decides when a file is ready to upload."""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

PHOTO_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
MAX_FILE_NAME = 255
# Skipped anywhere in a path: sync tools' temp folders and system files.
IGNORED_PARTS = {"@eaDir", "$RECYCLE.BIN", "System Volume Information", ".tmp.drivedownload", ".tmp.driveupload"}


def is_photo(path: Path) -> bool:
    if path.name.startswith(".") or path.suffix.lower() not in PHOTO_SUFFIXES:
        return False
    return not any(part.startswith(".") or part in IGNORED_PARTS for part in path.parts[:-1])


def file_name_in_project(root: Path, path: Path) -> str:
    """A photo's name inside its project: its path below the project folder, with "/"."""
    return path.relative_to(root).as_posix()[-MAX_FILE_NAME:]


def photos_in(root: Path) -> list[Path]:
    """Every photo below a folder, in name order."""
    found = []
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if path.is_file() and is_photo(rel):
            found.append(path)
    return sorted(found)


@dataclass
class _Seen:
    size: int
    mtime: float


class Settler:
    """Says when a file has stopped changing.

    Google Drive, Dropbox and camera tethering write files in pieces. A file
    is ready once its size and modified time are the same on two scans in a
    row and it's at least `min_age` seconds old.
    """

    def __init__(self, min_age: float = 2.0, clock=time.time):
        self.min_age = min_age
        self.clock = clock
        self._seen: dict[Path, _Seen] = {}

    def ready(self, path: Path) -> bool:
        try:
            stat = path.stat()
        except OSError:
            self._seen.pop(path, None)
            return False
        now = _Seen(stat.st_size, stat.st_mtime)
        before = self._seen.get(path)
        self._seen[path] = now
        if stat.st_size == 0 or self.clock() - stat.st_mtime < self.min_age:
            return False
        return before == now

    def forget(self, path: Path) -> None:
        self._seen.pop(path, None)
