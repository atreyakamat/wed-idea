import json

import pytest
import requests

from cwp_worker import config
from cwp_worker.api import ApiError, Client
from cwp_worker.cli import main


class Response:
    def __init__(self, status: int, body: dict | None = None):
        self.status_code = status
        self._body = body
        self.reason = "reason"
        self.text = json.dumps(body or {})
        self.ok = status < 400

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


class Session:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []
        self.headers = {}

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    def put(self, url, **kwargs):
        return self.request("PUT", url, **kwargs)


TOKEN = "cwp_wk_" + "a" * 48


def client(*responses):
    session = Session(*responses)
    return Client("https://app.example.in/", TOKEN, session=session, sleep=lambda s: None), session


def test_sends_the_token_and_reads_json():
    c, s = client(Response(200, {"projects": [{"id": "1"}]}))
    assert c.projects() == [{"id": "1"}]
    assert s.headers["Authorization"] == f"Bearer {TOKEN}"
    assert s.calls[0][1] == "https://app.example.in/api/worker/projects"


def test_retries_server_errors_and_dropped_connections():
    c, s = client(requests.ConnectionError("down"), Response(503), Response(200, {"names": ["a.jpg"]}))
    assert c.file_names("p") == {"a.jpg"}
    assert len(s.calls) == 3


def test_refusals_carry_the_servers_message_and_are_not_retried():
    c, s = client(Response(403, {"error": "This project has reached 300 photos."}))
    with pytest.raises(ApiError) as err:
        c.reserve("p")
    assert str(err.value) == "This project has reached 300 photos." and err.value.fatal
    assert len(s.calls) == 1


def test_uploads_raw_jpeg_to_the_one_time_url():
    c, s = client(Response(200, {}))
    c.put("https://storage/upload/sign/x?token=t", b"jpeg")
    method, url, kwargs = s.calls[0]
    assert method == "PUT" and kwargs["data"] == b"jpeg" and kwargs["headers"]["Content-Type"] == "image/jpeg"


def test_confirm_reports_duplicates():
    c, _ = client(Response(200, {"ok": True, "duplicate": True}))
    assert c.confirm("p", {}) is False


def test_login_saves_a_private_config(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("CWP_WORKER_HOME", str(tmp_path))
    monkeypatch.delenv("CWP_SITE", raising=False)
    monkeypatch.delenv("CWP_TOKEN", raising=False)
    monkeypatch.setattr(Client, "me", lambda self: {"computer": "Studio iMac", "studio": {"name": "Saltwater"}, "blocked": None})
    assert main(["login", "--site", "https://app.example.in/", "--token", TOKEN]) == 0
    assert "Saltwater" in capsys.readouterr().out
    saved = config.load()
    assert saved == config.Config("https://app.example.in", TOKEN)
    assert oct(config.config_path().stat().st_mode & 0o777) == "0o600"


def test_commands_need_login_first(tmp_path, monkeypatch):
    monkeypatch.setenv("CWP_WORKER_HOME", str(tmp_path))
    monkeypatch.delenv("CWP_SITE", raising=False)
    monkeypatch.delenv("CWP_TOKEN", raising=False)
    with pytest.raises(SystemExit) as exit_:
        main(["projects"])
    assert "Connect a PC" in str(exit_.value)


def test_upload_retry_after_a_lost_reply_counts_as_done():
    c, s = client(Response(503), Response(400, {"statusCode": "409", "error": "Duplicate", "message": "The resource already exists"}))
    c.put("https://storage/upload/sign/x?token=t", b"jpeg")
    assert len(s.calls) == 2


def test_unfinished_upload_is_not_fatal():
    c, _ = client(Response(422, {"error": "Upload didn't finish. Try that photo again."}))
    with pytest.raises(ApiError) as err:
        c.confirm("p", {})
    assert not err.value.fatal


def test_edit_command_writes_edited_copies_and_a_report(tmp_path, capsys):
    from .conftest import make_jpeg

    shoot = tmp_path / "Shoot"
    make_jpeg(shoot / "IMG_1.jpg", size=(800, 600))
    make_jpeg(shoot / "Cake" / "IMG_2.jpg", size=(600, 800))
    assert main(["edit", str(shoot), "--sheet"]) == 0
    out = tmp_path / "Shoot (edited)"
    assert (out / "IMG_1.jpg").exists() and (out / "Cake" / "IMG_2.jpg").exists()
    assert (out / "_sheet-1.jpg").exists()
    report = (out / "looks.csv").read_text().splitlines()
    assert report[0] == "file,lighting,confidence,look" and len(report) == 3
    assert (shoot / "IMG_1.jpg").exists()  # originals untouched


def test_edit_refuses_to_write_inside_the_photos_folder(tmp_path):
    from .conftest import make_jpeg

    make_jpeg(tmp_path / "Shoot" / "a.jpg", size=(100, 100))
    with pytest.raises(SystemExit, match="outside"):
        main(["edit", str(tmp_path / "Shoot"), "--out", str(tmp_path / "Shoot" / "out")])


def test_looks_lists_all_25(capsys):
    assert main(["looks"]) == 0
    lines = [line for line in capsys.readouterr().out.splitlines() if line.startswith("  ")]
    assert len(lines) == 25
