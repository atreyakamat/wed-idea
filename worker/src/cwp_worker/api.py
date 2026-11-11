"""Talks to the Cute Wedding Polaroid worker API."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import requests

from . import __version__

TIMEOUT = (10, 60)  # connect, read (seconds)
RETRIES = 4


class ApiError(Exception):
    """A refusal from the server. `fatal` means retrying won't help."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status

    @property
    def fatal(self) -> bool:
        # 401: token revoked. 403: plan limit or studio access. 409: archived.
        return self.status in (401, 403, 409)


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    slug: str
    status: str


@dataclass(frozen=True)
class Reservation:
    photo_id: str
    full_url: str
    thumb_url: str


class Client:
    def __init__(self, site: str, token: str, session: requests.Session | None = None, sleep=time.sleep):
        self.site = site.rstrip("/")
        self.session = session or requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}", "User-Agent": f"cwp-worker/{__version__}"})
        self.sleep = sleep

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self.site}/api/worker{path}"
        for attempt in range(RETRIES + 1):
            try:
                response = self.session.request(method, url, timeout=TIMEOUT, **kwargs)
            except requests.RequestException as exc:
                if attempt == RETRIES:
                    raise ApiError(f"Can't reach {self.site}: {exc}") from exc
                self.sleep(2**attempt)
                continue
            if response.status_code >= 500 or response.status_code == 429:
                if attempt == RETRIES:
                    raise ApiError(_message(response), response.status_code)
                self.sleep(2**attempt)
                continue
            if response.status_code >= 400:
                raise ApiError(_message(response), response.status_code)
            return response.json()
        raise ApiError("Request failed")  # pragma: no cover - loop always returns or raises

    def me(self) -> dict[str, Any]:
        return self._request("GET", "/me")

    def projects(self) -> list[dict[str, Any]]:
        return self._request("GET", "/projects")["projects"]

    def ensure_project(self, name: str) -> tuple[Project, bool]:
        """The project for a folder name, created if it doesn't exist."""
        body = self._request("POST", "/projects", json={"name": name})
        p = body["project"]
        return Project(p["id"], p["name"], p["slug"], p["status"]), bool(body.get("created"))

    def file_names(self, project_id: str) -> set[str]:
        return set(self._request("GET", f"/projects/{project_id}/files")["names"])

    def reserve(self, project_id: str) -> Reservation:
        body = self._request("POST", f"/projects/{project_id}/uploads")
        return Reservation(body["photoId"], body["full"], body["thumb"])

    def put(self, url: str, data: bytes) -> None:
        """Uploads one JPEG to a one-time upload URL."""
        for attempt in range(RETRIES + 1):
            try:
                response = self.session.put(url, data=data, headers={"Content-Type": "image/jpeg", "x-upsert": "false", "Cache-Control": "max-age=31536000"}, timeout=TIMEOUT)
            except requests.RequestException as exc:
                if attempt == RETRIES:
                    raise ApiError(f"Upload failed: {exc}") from exc
                self.sleep(2**attempt)
                continue
            if response.ok:
                return
            if response.status_code < 500 or attempt == RETRIES:
                raise ApiError(f"Upload failed ({response.status_code}): {response.text[:200]}", response.status_code)
            self.sleep(2**attempt)

    def confirm(self, project_id: str, photo: dict[str, Any]) -> bool:
        """Records an uploaded photo. False if the file name was already there."""
        body = self._request("POST", f"/projects/{project_id}/photos", json=photo)
        return not body.get("duplicate", False)


def _message(response: requests.Response) -> str:
    try:
        return str(response.json().get("error") or response.reason)
    except ValueError:
        return f"{response.status_code} {response.reason}"
