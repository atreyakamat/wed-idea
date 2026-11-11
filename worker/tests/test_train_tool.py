import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("train_lighting", ROOT / "tools" / "train_lighting.py")
train = importlib.util.module_from_spec(spec)
spec.loader.exec_module(train)


def test_builds_download_addresses_from_ids_only():
    assert train.sample_url({"id": "a", "source": "pexels", "photo": "1190298"}).startswith("https://images.pexels.com/photos/1190298/")
    assert train.sample_url({"id": "b", "source": "picsum", "photo": 7, "width": 1280, "height": 853}) == "https://picsum.photos/id/7/1280/853"


def test_rejects_anything_that_isnt_a_known_source_and_number():
    with pytest.raises(ValueError):
        train.sample_url({"id": "x", "source": "evil", "photo": 1})
    with pytest.raises(ValueError):
        train.sample_url({"id": "x", "source": "pexels", "photo": "1/../../admin"})
    with pytest.raises(ValueError):
        train.sample_url({"id": "x", "source": "picsum", "photo": 1, "width": 99999, "height": 1})


def test_every_sample_has_a_buildable_address():
    for s in json.loads((ROOT / "samples" / "lighting-samples.json").read_text()):
        assert train.sample_url(s).startswith("https://")
