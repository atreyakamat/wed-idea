"""Entry point for the installed PC app (PyInstaller). Opens the window when started with no arguments."""

import sys

from cwp_worker.cli import main

if __name__ == "__main__":
    sys.exit(main())
