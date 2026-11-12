"""The desktop app's logic, kept apart from its window so it can be tested.

* parse_connect: reads the "connect" text the dashboard shows (the whole
  `cwp-worker login …` line, or just the key and address).
* AppSettings: the folder to watch and the editing choice, remembered.
* Runner: watches the folder on a background thread until stopped.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

from . import config
from .api import ApiError, Client
from .scan import Settler
from .sync import Watcher, default_workers

TOKEN = re.compile(r"cwp_wk_[0-9a-f]{48}")
SITE = re.compile(r"https?://[^\s\"']+")
SETTINGS_FILE = "app.json"

log = logging.getLogger("cwp_worker")


@dataclass(frozen=True)
class Connect:
    site: str
    token: str


def parse_connect(text: str, default_site: str | None = None) -> Connect | None:
    """The site and key in what the photographer pasted, or None if there's no key."""
    token = TOKEN.search(text or "")
    if not token:
        return None
    site = SITE.search(text)
    chosen = (site.group(0) if site else default_site or "").rstrip("/")
    if not chosen.startswith(("https://", "http://")):
        return None
    return Connect(site=chosen, token=token.group(0))


@dataclass
class AppSettings:
    folder: str = ""
    one_project: bool = False
    edit: bool = True

    @staticmethod
    def path() -> Path:
        return config.config_path().parent / SETTINGS_FILE

    @classmethod
    def load(cls) -> "AppSettings":
        try:
            data = json.loads(cls.path().read_text(encoding="utf-8"))
            return cls(folder=str(data.get("folder", "")), one_project=bool(data.get("one_project", False)), edit=bool(data.get("edit", True)))
        except (OSError, ValueError):
            return cls()

    def save(self) -> None:
        self.path().parent.mkdir(parents=True, exist_ok=True)
        self.path().write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")


def connect(text: str, default_site: str | None = None, client_factory: Callable[[str, str], Client] = Client) -> tuple[str, str]:
    """Checks the pasted key with the site and saves it. Returns (studio name, computer name)."""
    parsed = parse_connect(text, default_site)
    if not parsed:
        raise ValueError("Paste the whole connect line from the dashboard (it has a key starting cwp_wk_ and your site's address).")
    me = client_factory(parsed.site, parsed.token).me()
    config.save(config.Config(parsed.site, parsed.token))
    return me["studio"]["name"], me.get("computer", "")


class Runner:
    """Watches a folder on a background thread. One at a time."""

    def __init__(self, client: Client, settings: AppSettings, interval: float = 10.0):
        self.client = client
        self.settings = settings
        self.interval = interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.error: str | None = None

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self) -> None:
        if self.running:
            return
        folder = Path(self.settings.folder).expanduser()
        if not folder.is_dir():
            raise ValueError("Choose a folder that exists.")
        self._stop.clear()
        self.error = None
        self._thread = threading.Thread(target=self._run, args=(folder,), name="cwp-watch", daemon=True)
        self._thread.start()

    def _run(self, folder: Path) -> None:
        try:
            project = None
            if self.settings.one_project:
                project, created = self.client.ensure_project(folder.name)
                log.info("%s project %s", "Created" if created else "Using", project.name)
            watcher = Watcher(self.client, folder, project=project, settler=Settler(), workers=default_workers(), edit=self.settings.edit)
            watcher.run(self.interval, self._stop.wait, self._stop.is_set)
            if watcher.disconnected:
                self.error = watcher.disconnected
        except ApiError as exc:
            self.error = str(exc)
            log.error("%s", exc)
        except Exception as exc:  # noqa: BLE001 - shown in the window rather than lost
            self.error = f"Stopped: {exc}"
            log.exception("Watching stopped")

    def stop(self, timeout: float = 30.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout)
