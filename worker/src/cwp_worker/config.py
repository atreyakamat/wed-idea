"""Where the worker keeps its site and token."""

from __future__ import annotations

import json
import os
import stat
from dataclasses import dataclass
from pathlib import Path


def config_path() -> Path:
    base = os.environ.get("CWP_WORKER_HOME")
    if base:
        return Path(base) / "config.json"
    if os.name == "nt":
        return Path(os.environ.get("APPDATA", Path.home())) / "cwp-worker" / "config.json"
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "cwp-worker" / "config.json"


@dataclass(frozen=True)
class Config:
    site: str
    token: str


def load() -> Config | None:
    site = os.environ.get("CWP_SITE")
    token = os.environ.get("CWP_TOKEN")
    if site and token:
        return Config(site, token)
    path = config_path()
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return Config(data["site"], data["token"])


def save(config: Config) -> Path:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"site": config.site, "token": config.token}, indent=2), encoding="utf-8")
    # The token can upload to the studio: readable by this user only.
    if os.name != "nt":
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    return path
