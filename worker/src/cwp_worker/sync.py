"""Uploads a folder's new photos into a project."""

from __future__ import annotations

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Protocol

from .api import ApiError, Project, Reservation
from .images import HEIC_SUPPORTED, Prepared, prepare
from .scan import Settler, file_name_in_project, photos_in

log = logging.getLogger("cwp_worker")

UPLOADS_AT_ONCE = 3
# A photo that fails this many times is left alone until the worker restarts.
MAX_ATTEMPTS = 3


class Api(Protocol):
    def file_names(self, project_id: str) -> set[str]: ...
    def reserve(self, project_id: str) -> Reservation: ...
    def put(self, url: str, data: bytes) -> None: ...
    def confirm(self, project_id: str, photo: dict) -> bool: ...
    def ensure_project(self, name: str) -> tuple[Project, bool]: ...


@dataclass
class Stats:
    uploaded: int = 0
    skipped: int = 0
    failed: dict[str, str] = field(default_factory=dict)
    stopped: str | None = None
    # HTTP status behind `stopped`: 401 means the computer was disconnected.
    stopped_status: int | None = None

    def add(self, other: "Stats") -> None:
        self.uploaded += other.uploaded
        self.skipped += other.skipped
        self.failed.update(other.failed)
        if not self.stopped:
            self.stopped, self.stopped_status = other.stopped, other.stopped_status


def _modified_at(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")


class ProjectSync:
    """Keeps one project in step with one folder.

    Knows which file names the project already has, so dropping the same files
    again (or restarting the worker) uploads nothing twice.
    """

    def __init__(self, api: Api, project: Project, folder: Path, prepare_fn: Callable[[Path], Prepared] = prepare):
        self.api = api
        self.project = project
        self.folder = folder
        self.prepare = prepare_fn
        self.known = api.file_names(project.id)
        self.failures: dict[str, int] = {}
        self._lock = threading.Lock()

    def pending(self) -> list[Path]:
        """New photos, minus any that failed MAX_ATTEMPTS times this session."""
        out = []
        for path in photos_in(self.folder):
            name = file_name_in_project(self.folder, path)
            if name not in self.known and self.failures.get(name, 0) < MAX_ATTEMPTS:
                out.append(path)
        return out

    def upload_one(self, path: Path) -> bool:
        """Uploads one photo. True if it was added, False if it was already there."""
        name = file_name_in_project(self.folder, path)
        if path.suffix.lower() in {".heic", ".heif"} and not HEIC_SUPPORTED:
            raise ApiError('HEIC needs the extra: pip install "cwp-worker[heic]"')
        prepared = self.prepare(path)
        reservation = self.api.reserve(self.project.id)
        self.api.put(reservation.full_url, prepared.full)
        self.api.put(reservation.thumb_url, prepared.thumb)
        added = self.api.confirm(
            self.project.id,
            {
                "photoId": reservation.photo_id,
                "fileName": name,
                "width": prepared.width,
                "height": prepared.height,
                "bytes": path.stat().st_size,
                "takenAt": prepared.taken_at or _modified_at(path),
            },
        )
        with self._lock:
            self.known.add(name)
        return added

    def upload(self, paths: list[Path], workers: int = UPLOADS_AT_ONCE) -> Stats:
        stats = Stats()
        stop = threading.Event()

        def fail(name: str, message: str) -> None:
            with self._lock:
                stats.failed[name] = message
                self.failures[name] = self.failures.get(name, 0) + 1

        def run(path: Path) -> None:
            if stop.is_set():
                return
            name = file_name_in_project(self.folder, path)
            try:
                added = self.upload_one(path)
                with self._lock:
                    if added:
                        stats.uploaded += 1
                    else:
                        stats.skipped += 1
                if added:
                    log.info("%s: uploaded %s", self.project.slug, name)
            except ApiError as exc:
                fail(name, str(exc))
                log.warning("%s: %s failed: %s", self.project.slug, name, exc)
                if exc.fatal:
                    # Plan limit, access or a revoked token: the rest would fail too.
                    stats.stopped, stats.stopped_status = str(exc), exc.status
                    stop.set()
            except (OSError, ValueError, SyntaxError) as exc:
                # Pillow raises these for unreadable or truncated files.
                fail(name, f"Couldn't read the photo: {exc}")
                log.warning("%s: couldn't read %s: %s", self.project.slug, name, exc)

        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            list(pool.map(run, paths))
        return stats


def upload_folder(api: Api, project: Project, folder: Path, settler: Settler, *, workers: int = UPLOADS_AT_ONCE, wait: Callable[[float], None], max_rounds: int = 30) -> Stats:
    """Uploads everything new in a folder, waiting for files still being written."""
    sync = ProjectSync(api, project, folder)
    total = Stats()
    for _ in range(max_rounds):
        pending = sync.pending()
        if not pending:
            break
        ready = [p for p in pending if settler.ready(p)]
        if ready:
            stats = sync.upload(ready, workers)
            total.add(stats)
            if stats.stopped:
                break
        else:
            wait(1.0)
    return total


class Watcher:
    """Watches a folder of shoots: each subfolder is a project.

    With `project` set, the folder itself is that one project instead.
    """

    def __init__(self, api: Api, root: Path, *, project: Project | None = None, settler: Settler | None = None, workers: int = UPLOADS_AT_ONCE):
        self.api = api
        self.root = root
        self.single = project
        self.settler = settler or Settler()
        self.workers = workers
        self.syncs: dict[Path, ProjectSync] = {}
        self.blocked: dict[Path, str] = {}
        # Set when the token stops working: nothing more can be done.
        self.disconnected: str | None = None

    def folders(self) -> list[Path]:
        if self.single:
            return [self.root]
        return sorted(p for p in self.root.iterdir() if p.is_dir() and not p.name.startswith(".") and not p.name.startswith("@"))

    def _sync_for(self, folder: Path) -> ProjectSync | None:
        if folder in self.blocked:
            return None
        sync = self.syncs.get(folder)
        if sync:
            return sync
        if self.single:
            project = self.single
        else:
            # Only make a project once the folder has a photo in it.
            if not any(photos_in(folder)):
                return None
            project, created = self.api.ensure_project(folder.name)
            log.info("%s project %s for folder %s", "Created" if created else "Using", project.slug, folder.name)
        sync = ProjectSync(self.api, project, folder)
        self.syncs[folder] = sync
        return sync

    def scan_once(self) -> Stats:
        total = Stats()
        for folder in self.folders():
            try:
                sync = self._sync_for(folder)
            except ApiError as exc:
                log.warning("Folder %s: %s", folder.name, exc)
                if exc.status == 401:
                    self.disconnected = str(exc)
                    return total
                if exc.fatal:
                    self.blocked[folder] = str(exc)
                continue
            if not sync:
                continue
            ready = [p for p in sync.pending() if self.settler.ready(p)]
            if ready:
                stats = sync.upload(ready, self.workers)
                total.add(stats)
                if stats.stopped:
                    self.blocked[folder] = stats.stopped
                    if stats.stopped_status == 401:
                        self.disconnected = stats.stopped
                        return total
        return total

    def run(self, interval: float, wait: Callable[[float], None], should_stop: Callable[[], bool] = lambda: False) -> None:
        log.info("Watching %s (every %ss). Press Ctrl+C to stop.", self.root, interval)
        while not should_stop():
            self.scan_once()
            if self.disconnected:
                log.error("%s", self.disconnected)
                return
            wait(interval)


def default_workers() -> int:
    return max(1, min(UPLOADS_AT_ONCE, (os.cpu_count() or 2)))
