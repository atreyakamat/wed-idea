"""The website's copy of the looks engine reads its numbers from a file this repo generates."""

import importlib.util
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1] / "tools" / "export_looks.py"


def test_engine_data_for_the_website_is_up_to_date():
    spec = importlib.util.spec_from_file_location("export_looks", TOOL)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.DATA.read_text() == module.render_data(), "Run: python worker/tools/export_looks.py --fixtures"
