import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("train_lighting", Path(__file__).resolve().parents[1] / "tools" / "train_lighting.py")
train = importlib.util.module_from_spec(spec)
spec.loader.exec_module(train)


class Resp:
    def __init__(self, status, location=None, content=b"img"):
        self.status_code, self.content = status, content
        self.headers = {"location": location} if location else {}
        self.is_redirect = location is not None

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class Session:
    def __init__(self, *responses):
        self.responses, self.urls = list(responses), []

    def get(self, url, **kw):
        self.urls.append(url)
        return self.responses.pop(0)


def test_downloads_only_from_photo_hosts_over_https():
    for bad in ["http://picsum.photos/id/1/10/10", "https://169.254.169.254/latest", "https://evil.example/x.jpg", "file:///etc/passwd"]:
        with pytest.raises(ValueError, match="Not downloading"):
            train.download(bad, Session())


def test_follows_redirects_only_to_allowed_hosts():
    ok = Session(Resp(302, "https://fastly.picsum.photos/id/1/10/10.jpg"), Resp(200))
    assert train.download("https://picsum.photos/id/1/10/10", ok) == b"img"
    bad = Session(Resp(302, "http://127.0.0.1:8080/admin"))
    with pytest.raises(ValueError, match="Not downloading"):
        train.download("https://picsum.photos/id/1/10/10", bad)


def test_samples_file_uses_only_allowed_hosts():
    import json

    samples = json.loads((Path(__file__).resolve().parents[1] / "samples" / "lighting-samples.json").read_text())
    for s in samples:
        train._check_url(s["download"])
