from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image

from cwp_worker.api import ApiError, Project, Reservation


def make_jpeg(path: Path, size=(4000, 3000), taken: str | None = "2026:11:08 18:42:07", orientation: int | None = None, gps: bool = False) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", size, (200, 120, 90))
    exif = Image.Exif()
    if taken:
        exif.get_ifd(0x8769)[0x9003] = taken
    if orientation:
        exif[0x0112] = orientation
    if gps:
        exif.get_ifd(0x8825)[2] = (15.0, 30.0, 0.0)
    image.save(path, "JPEG", exif=exif.tobytes())
    return path


class FakeApi:
    """Stands in for the server: records what the worker sends."""

    def __init__(self, existing: set[str] | None = None, limit: int | None = None):
        self.existing = set(existing or ())
        self.limit = limit
        self.puts: list[tuple[str, bytes]] = []
        self.confirmed: list[dict] = []
        self.projects: dict[str, Project] = {}
        self.reserved = 0
        self.fail_reserve: ApiError | None = None

    def file_names(self, project_id: str) -> set[str]:
        return set(self.existing)

    def reserve(self, project_id: str) -> Reservation:
        if self.fail_reserve:
            raise self.fail_reserve
        if self.limit is not None and len(self.confirmed) >= self.limit:
            raise ApiError("This project has reached 2 photos, the most the Trial plan allows.", 403)
        self.reserved += 1
        n = self.reserved
        return Reservation(f"00000000-0000-4000-8000-{n:012d}", f"https://up/full/{n}", f"https://up/thumb/{n}")

    def put(self, url: str, data: bytes) -> None:
        self.puts.append((url, data))

    def confirm(self, project_id: str, photo: dict) -> bool:
        if photo["fileName"] in self.existing:
            return False
        self.existing.add(photo["fileName"])
        self.confirmed.append(photo)
        return True

    def ensure_project(self, name: str) -> tuple[Project, bool]:
        slug = name.lower().replace(" ", "-")
        if slug in self.projects:
            return self.projects[slug], False
        project = Project(f"id-{slug}", name, slug, "draft")
        self.projects[slug] = project
        return project, True


@pytest.fixture
def api() -> FakeApi:
    return FakeApi()


def decode(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))
