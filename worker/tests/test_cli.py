

def test_output_never_crashes_on_a_non_utf8_console(monkeypatch):
    import io
    import sys

    from cwp_worker.cli import _safe_output

    narrow = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
    monkeypatch.setattr(sys, "stdout", narrow)
    _safe_output()
    print("Golden hour → Golden Glow · done")
    narrow.flush()
    assert b"Golden hour ? Golden Glow" in narrow.buffer.getvalue()
