"""Entry point for the installed PC app (PyInstaller). Opens the window when started with no arguments."""

import os
import sys
import traceback
from pathlib import Path

# A windowed build has no console: sys.stdout and sys.stderr are None, and
# anything that prints would fail. Send them to a log file next to the
# app's settings instead, so a problem can still be read afterwards.
if sys.stdout is None or sys.stderr is None:
    from cwp_worker import config

    log_path = Path(config.config_path()).parent / "app.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    stream = open(log_path, "a", encoding="utf-8", buffering=1)  # noqa: SIM115 - lives as long as the app
    sys.stdout = sys.stdout or stream
    sys.stderr = sys.stderr or stream

from cwp_worker.cli import main  # noqa: E402

if __name__ == "__main__":
    try:
        code = main()
    except SystemExit:
        raise
    except BaseException:  # noqa: BLE001 - record any crash instead of showing a blocking dialog
        traceback.print_exc()
        code = 1
    sys.stdout.flush()
    os._exit(code if isinstance(code, int) else 0)
