from cwp_worker.scan import Settler, file_name_in_project, is_photo, photos_in

from .conftest import make_jpeg


def test_finds_photos_and_skips_system_files(tmp_path):
    make_jpeg(tmp_path / "IMG_1.JPG", size=(10, 10))
    make_jpeg(tmp_path / "Ceremony" / "IMG_2.jpg", size=(10, 10))
    (tmp_path / ".DS_Store").write_bytes(b"x")
    (tmp_path / "._IMG_1.JPG").write_bytes(b"x")
    (tmp_path / "clip.mp4").write_bytes(b"x")
    (tmp_path / ".tmp.drivedownload").mkdir()
    (tmp_path / ".tmp.drivedownload" / "part.jpg").write_bytes(b"x")
    names = [file_name_in_project(tmp_path, p) for p in photos_in(tmp_path)]
    assert names == ["Ceremony/IMG_2.jpg", "IMG_1.JPG"]


def test_is_photo_by_extension():
    from pathlib import Path

    assert is_photo(Path("a.HEIC"))
    assert not is_photo(Path("notes.txt"))


def test_settler_waits_for_two_identical_looks(tmp_path):
    now = [1_000_000.0]
    path = tmp_path / "a.jpg"
    path.write_bytes(b"abc")
    import os

    os.utime(path, (now[0] - 10, now[0] - 10))
    s = Settler(min_age=2, clock=lambda: now[0])
    assert not s.ready(path)  # first look
    assert s.ready(path)  # unchanged since
    path.write_bytes(b"abcdef")  # still being written
    os.utime(path, (now[0] - 5, now[0] - 5))
    assert not s.ready(path)
    assert s.ready(path)


def test_settler_waits_for_new_or_empty_files(tmp_path):
    import os

    path = tmp_path / "a.jpg"
    path.write_bytes(b"")
    s = Settler(min_age=2)
    s.ready(path)
    assert not s.ready(path)  # empty
    path.write_bytes(b"x")
    s.ready(path)
    assert not s.ready(path)  # just written
    os.utime(path, (1, 1))
    s.ready(path)
    assert s.ready(path)
