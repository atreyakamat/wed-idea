import numpy as np
import pytest
from PIL import Image, ImageDraw

from cwp_worker.images import prepare
from cwp_worker.looks import LOOKS, LOOKS_BY_GROUP, classify, edit, get_look, measure
from cwp_worker.looks.engine import UNSURE_STRENGTH, plan_fix
from cwp_worker.looks.lighting import GROUPS, feature_vector
from cwp_worker.looks import lighting_model

from .conftest import make_jpeg


def scene(kind: str, size=(600, 400)) -> Image.Image:
    """Simple synthetic scenes with the light each group is about."""
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    if kind == "daylight":
        d.rectangle([0, 0, w, h // 2], fill=(110, 170, 235))  # blue sky
        d.rectangle([0, h // 2, w, h], fill=(80, 150, 70))  # grass
        d.ellipse([w // 2 - 40, h // 2 - 80, w // 2 + 40, h // 2 + 40], fill=(220, 180, 150))
    elif kind == "golden":
        for y in range(h):
            t = y / h
            d.line([(0, y), (w, y)], fill=(int(255 - 60 * t), int(190 - 90 * t), int(90 - 50 * t)))
        d.ellipse([w // 2 - 50, h // 3 - 50, w // 2 + 50, h // 3 + 50], fill=(255, 245, 200))
    elif kind == "stage":
        d.rectangle([0, 0, w, h], fill=(8, 6, 14))
        for i, colour in enumerate([(230, 40, 220), (40, 220, 210), (200, 30, 255)]):
            x = 100 + i * 180
            d.polygon([(x, 0), (x - 60, h), (x + 60, h)], fill=colour)
    elif kind == "night":
        d.rectangle([0, 0, w, h], fill=(10, 12, 25))
        for i in range(12):
            d.ellipse([40 * i + 10, 60, 40 * i + 22, 72], fill=(255, 220, 160))
    return img


def test_there_are_25_looks_five_per_kind_of_light():
    assert len(LOOKS) == 25
    assert len({look.id for look in LOOKS}) == 25
    assert sorted(LOOKS_BY_GROUP) == sorted(GROUPS)
    assert all(len(looks) == 5 for looks in LOOKS_BY_GROUP.values())


def test_every_look_renders_and_keeps_the_size():
    img = scene("golden")
    for look in LOOKS:
        out = edit(img, look_id=look.id).image
        assert out.size == img.size and out.mode == "RGB"


def test_mono_looks_are_black_and_white():
    out = np.asarray(edit(scene("stage"), look_id="mono-punch").image).astype(int)
    assert np.abs(out[..., 0] - out[..., 1]).max() <= 2 and np.abs(out[..., 1] - out[..., 2]).max() <= 2


def test_unknown_look_is_a_clear_error():
    with pytest.raises(KeyError, match="No look called"):
        get_look("instagram-valencia")


def test_edits_are_repeatable():
    img = scene("night")
    a = np.asarray(edit(img, look_id="vintage-grain", seed=b"x").image)
    b = np.asarray(edit(img, look_id="vintage-grain", seed=b"x").image)
    assert (a == b).all()


@pytest.mark.parametrize("kind", ["daylight", "golden", "stage", "night"])
def test_obvious_scenes_land_in_the_right_family(kind):
    family = {"daylight": "bright", "golden": "warm", "indoor": "warm", "stage": "dark", "night": "dark"}
    lighting = classify(measure(scene(kind)))
    assert family[lighting.group] == family[kind], lighting.scores


def test_probabilities_add_up():
    lighting = classify(measure(scene("daylight")))
    assert abs(sum(lighting.scores.values()) - 1) < 0.01
    assert lighting.confidence == max(lighting.scores.values())


def test_model_matches_the_features():
    n = len(feature_vector(measure(scene("daylight"))))
    assert len(lighting_model.MEAN) == len(lighting_model.SCALE) == len(lighting_model.WEIGHTS) == n
    assert all(len(row) == len(GROUPS) for row in lighting_model.WEIGHTS)


def test_auto_fix_brightens_dark_daylight_and_tames_bright():
    dark = measure(Image.new("RGB", (300, 200), (40, 45, 50)))
    bright = measure(Image.new("RGB", (300, 200), (235, 235, 235)))
    assert plan_fix(dark, "daylight", 0.2).ev > 0.5
    assert plan_fix(bright, "daylight", 0.2).ev < 0
    assert abs(plan_fix(dark, "daylight", 0.2).ev) <= 1.5


def test_white_balance_keeps_the_mood_when_asked():
    warm = measure(scene("golden"))
    neutralise = plan_fix(warm, "golden", 0.0).gains
    keep = plan_fix(warm, "golden", 1.0).gains
    assert neutralise[2] > neutralise[0]  # pulls blue up, red down
    assert keep == (1.0, 1.0, 1.0)


def test_unsure_photos_get_a_gentle_default(monkeypatch):
    import cwp_worker.looks.engine as engine
    from cwp_worker.looks.lighting import Lighting

    unsure = Lighting("golden", 0.3, {"daylight": 0.3, "golden": 0.3, "indoor": 0.05, "stage": 0.3, "night": 0.05}, "x")
    monkeypatch.setattr(engine, "classify", lambda f: unsure)
    result = engine.edit(scene("golden"))
    assert result.look.id == "golden-glow" and result.strength == UNSURE_STRENGTH


def test_prepare_makes_an_edited_pair(tmp_path):
    p = prepare(make_jpeg(tmp_path / "a.jpg", size=(3000, 2000)), edit=True)
    assert p.edited is not None
    assert p.edited.lighting in GROUPS and get_look(p.edited.look)
    edited = Image.open(__import__("io").BytesIO(p.edited.full))
    assert edited.size == (2400, 1600)
    assert len(edited.getexif()) == 0
    plain = prepare(make_jpeg(tmp_path / "b.jpg", size=(800, 600)))
    assert plain.edited is None


def test_prepare_with_a_chosen_look(tmp_path):
    p = prepare(make_jpeg(tmp_path / "a.jpg", size=(800, 600)), edit=True, look="classic-bw")
    assert p.edited.look == "classic-bw"
