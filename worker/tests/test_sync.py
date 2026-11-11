from cwp_worker.api import ApiError
from cwp_worker.scan import Settler
from cwp_worker.sync import MAX_ATTEMPTS, ProjectSync, Watcher, upload_folder

from .conftest import FakeApi, make_jpeg

import os


def settled() -> Settler:
    return Settler(min_age=0, clock=lambda: 10**10)


def age(*paths):
    for p in paths:
        os.utime(p, (1, 1))


def test_uploads_new_photos_once(tmp_path, api):
    a = make_jpeg(tmp_path / "IMG_1.jpg", size=(300, 200))
    b = make_jpeg(tmp_path / "Ceremony" / "IMG_2.jpg", size=(300, 200), taken=None)
    age(a, b)
    project, _ = api.ensure_project("Meera 30th")
    stats = upload_folder(api, project, tmp_path, settled(), wait=lambda s: None)
    assert stats.uploaded == 2
    assert sorted(c["fileName"] for c in api.confirmed) == ["Ceremony/IMG_2.jpg", "IMG_1.jpg"]
    assert len(api.puts) == 4  # web-size + thumbnail each
    by_name = {c["fileName"]: c for c in api.confirmed}
    assert by_name["IMG_1.jpg"]["takenAt"] == "2026-11-08T13:12:07Z"
    assert by_name["Ceremony/IMG_2.jpg"]["takenAt"].startswith("1970-01-01")  # file time when no EXIF
    # Running again uploads nothing.
    again = upload_folder(api, project, tmp_path, settled(), wait=lambda s: None)
    assert again.uploaded == 0 and len(api.confirmed) == 2


def test_skips_files_the_project_already_has(tmp_path):
    api = FakeApi(existing={"IMG_1.jpg"})
    age(make_jpeg(tmp_path / "IMG_1.jpg", size=(50, 50)), make_jpeg(tmp_path / "IMG_2.jpg", size=(50, 50)))
    project, _ = api.ensure_project("x")
    stats = upload_folder(api, project, tmp_path, settled(), wait=lambda s: None)
    assert stats.uploaded == 1
    assert [c["fileName"] for c in api.confirmed] == ["IMG_2.jpg"]


def test_stops_at_the_plan_limit(tmp_path):
    api = FakeApi(limit=2)
    for i in range(5):
        age(make_jpeg(tmp_path / f"IMG_{i}.jpg", size=(50, 50)))
    project, _ = api.ensure_project("x")
    stats = upload_folder(api, project, tmp_path, settled(), workers=1, wait=lambda s: None)
    assert stats.uploaded == 2
    assert stats.stopped and "most the Trial plan allows" in stats.stopped
    assert stats.stopped_status == 403


def test_unreadable_files_are_reported_and_given_up_on(tmp_path, api):
    bad = tmp_path / "broken.jpg"
    bad.write_bytes(b"not a jpeg")
    age(bad)
    project, _ = api.ensure_project("x")
    sync = ProjectSync(api, project, tmp_path)
    for _ in range(MAX_ATTEMPTS):
        stats = sync.upload(sync.pending())
        assert "broken.jpg" in stats.failed
    assert sync.pending() == []


def test_waits_for_files_still_being_written(tmp_path, api):
    path = make_jpeg(tmp_path / "IMG_1.jpg", size=(50, 50))  # brand new: too young
    project, _ = api.ensure_project("x")
    waits = []
    stats = upload_folder(api, project, tmp_path, Settler(min_age=3600), wait=waits.append, max_rounds=3)
    assert stats.uploaded == 0 and waits == [1.0, 1.0, 1.0]
    age(path)
    assert upload_folder(api, project, tmp_path, settled(), wait=lambda s: None).uploaded == 1


def test_watch_makes_one_project_per_subfolder(tmp_path, api):
    age(make_jpeg(tmp_path / "Meera 30th" / "a.jpg", size=(50, 50)), make_jpeg(tmp_path / "Rock Night" / "b.jpg", size=(50, 50)))
    (tmp_path / "Empty").mkdir()
    watcher = Watcher(api, tmp_path, settler=settled())
    watcher.scan_once()  # first look: files must stay the same for two scans
    assert api.confirmed == []
    watcher.scan_once()
    assert sorted(api.projects) == ["meera-30th", "rock-night"]  # no project for the empty folder
    assert len(api.confirmed) == 2
    # A new photo in an existing folder goes to the same project.
    age(make_jpeg(tmp_path / "Meera 30th" / "c.jpg", size=(50, 50)))
    watcher.scan_once()
    watcher.scan_once()
    assert len(api.projects) == 2 and len(api.confirmed) == 3


def test_watch_stops_when_the_computer_is_disconnected(tmp_path, api):
    age(make_jpeg(tmp_path / "Shoot" / "a.jpg", size=(50, 50)))
    api.fail_reserve = ApiError("This computer has been disconnected.", 401)
    watcher = Watcher(api, tmp_path, settler=settled())
    waits = []
    watcher.run(5, waits.append, should_stop=lambda: len(waits) > 5)
    assert watcher.disconnected and waits == [5]  # one look, then the failed upload ends it


def test_watch_keeps_going_when_one_project_is_full(tmp_path):
    api = FakeApi(limit=1)
    age(make_jpeg(tmp_path / "Shoot" / "a.jpg", size=(50, 50)), make_jpeg(tmp_path / "Shoot" / "b.jpg", size=(50, 50)))
    watcher = Watcher(api, tmp_path, settler=settled(), workers=1)
    watcher.scan_once()
    watcher.scan_once()
    assert len(api.confirmed) == 1
    assert tmp_path / "Shoot" in watcher.blocked and not watcher.disconnected
