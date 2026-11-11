from cwp_worker.images import FULL_LONG_EDGE, THUMB_LONG_EDGE, fit_within, parse_exif_time, prepare

from .conftest import decode, make_jpeg


def test_fit_within_scales_down_only():
    assert fit_within(4000, 3000, 2400) == (2400, 1800)
    assert fit_within(800, 600, 2400) == (800, 600)


def test_prepare_makes_web_and_thumb_sizes(tmp_path):
    p = prepare(make_jpeg(tmp_path / "a.jpg"))
    assert (p.width, p.height) == (FULL_LONG_EDGE, 1800)
    assert decode(p.full).size == (2400, 1800)
    assert max(decode(p.thumb).size) == THUMB_LONG_EDGE


def test_prepare_reads_capture_time_as_india_time(tmp_path):
    p = prepare(make_jpeg(tmp_path / "a.jpg", taken="2026:11:08 18:42:07"))
    assert p.taken_at == "2026-11-08T13:12:07Z"


def test_prepare_applies_rotation_and_drops_metadata(tmp_path):
    p = prepare(make_jpeg(tmp_path / "r.jpg", size=(4000, 3000), orientation=6, gps=True))
    assert (p.width, p.height) == (1800, 2400)  # turned upright
    out = decode(p.full)
    assert len(out.getexif()) == 0  # no GPS, no camera data
    assert 0x8825 not in out.getexif()


def test_prepare_handles_missing_exif_and_non_rgb(tmp_path):
    from PIL import Image

    path = tmp_path / "g.png"
    Image.new("LA", (500, 400)).save(path)
    p = prepare(path)
    assert p.taken_at is None
    assert decode(p.full).mode == "RGB"


def test_parse_exif_time():
    assert parse_exif_time("2026:11:08 18:42:07", "+00:00") == "2026-11-08T18:42:07Z"
    assert parse_exif_time("0000:00:00 00:00:00") is None
    assert parse_exif_time("garbage") is None
    assert parse_exif_time(None) is None
