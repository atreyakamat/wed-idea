import json
import threading

import pytest

from cwp_worker import config
from cwp_worker.app_logic import AppSettings, Runner, connect, parse_connect

TOKEN = "cwp_wk_" + "a1" * 24


def test_parse_connect_reads_the_dashboard_line():
    line = f"cwp-worker login --site https://app.example.in/ --token {TOKEN}"
    assert parse_connect(line).site == "https://app.example.in"
    assert parse_connect(line).token == TOKEN


def test_parse_connect_needs_a_key_and_an_address():
    assert parse_connect("hello") is None
    assert parse_connect(TOKEN) is None
    assert parse_connect(TOKEN, default_site="https://app.example.in").site == "https://app.example.in"
    assert parse_connect(f"{TOKEN} ftp://nope") is None


def test_connect_checks_the_key_then_saves_it(tmp_path, monkeypatch):
    monkeypatch.setenv("CWP_WORKER_HOME", str(tmp_path))
    monkeypatch.delenv("CWP_SITE", raising=False)
    monkeypatch.delenv("CWP_TOKEN", raising=False)

    class FakeClient:
        def __init__(self, site, token):
            assert (site, token) == ("https://app.example.in", TOKEN)

        def me(self):
            return {"studio": {"name": "Saltwater"}, "computer": "Studio PC"}

    assert connect(f"--site https://app.example.in --token {TOKEN}", client_factory=FakeClient) == ("Saltwater", "Studio PC")
    assert config.load() == config.Config("https://app.example.in", TOKEN)
    with pytest.raises(ValueError):
        connect("no key here", client_factory=FakeClient)


def test_settings_are_remembered(tmp_path, monkeypatch):
    monkeypatch.setenv("CWP_WORKER_HOME", str(tmp_path))
    assert AppSettings.load() == AppSettings()
    AppSettings(folder="/shoots", one_project=True, edit=False).save()
    assert AppSettings.load() == AppSettings(folder="/shoots", one_project=True, edit=False)
    (tmp_path / "app.json").write_text("{broken")
    assert AppSettings.load() == AppSettings()
    assert json.loads(json.dumps({"ok": 1}))


def test_runner_watches_until_stopped(tmp_path, monkeypatch):
    seen = threading.Event()

    class FakeWatcher:
        def __init__(self, client, folder, **kwargs):
            self.disconnected = None
            assert folder == tmp_path and kwargs["edit"] is True

        def run(self, interval, wait, should_stop):
            seen.set()
            while not should_stop():
                wait(0.01)

    monkeypatch.setattr("cwp_worker.app_logic.Watcher", FakeWatcher)
    runner = Runner(client=object(), settings=AppSettings(folder=str(tmp_path)), interval=0.01)
    runner.start()
    assert seen.wait(2) and runner.running
    runner.stop(2)
    assert not runner.running and runner.error is None


def test_runner_refuses_a_missing_folder(tmp_path):
    with pytest.raises(ValueError):
        Runner(client=object(), settings=AppSettings(folder=str(tmp_path / "nope"))).start()


def test_runner_reports_a_disconnected_computer(tmp_path, monkeypatch):
    class Gone:
        def __init__(self, *a, **k):
            self.disconnected = "This computer has been disconnected."

        def run(self, *a):
            return

    monkeypatch.setattr("cwp_worker.app_logic.Watcher", Gone)
    runner = Runner(client=object(), settings=AppSettings(folder=str(tmp_path)))
    runner.start()
    runner.stop(2)
    assert runner.error == "This computer has been disconnected."


def test_the_window_module_imports():
    pytest.importorskip("tkinter")
    import cwp_worker.app  # noqa: F401
