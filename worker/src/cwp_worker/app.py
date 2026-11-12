"""The PC app's window: connect once, choose a folder, press Start.

Built with Tkinter (part of Python), so the installer needs nothing else.
The work itself is in app_logic.py.
"""

from __future__ import annotations

import logging
import os
import queue
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from . import __version__, config
from .api import ApiError, Client
from .app_logic import AppSettings, Runner, connect

APP_NAME = os.environ.get("CWP_APP_NAME", "Cute Wedding Polaroid")
PAD = 12


class QueueHandler(logging.Handler):
    """Sends log lines to the window (from any thread)."""

    def __init__(self, lines: "queue.Queue[str]"):
        super().__init__(logging.INFO)
        self.lines = lines
        self.setFormatter(logging.Formatter("%(asctime)s  %(message)s", "%H:%M:%S"))

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.put(self.format(record))


class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.lines: "queue.Queue[str]" = queue.Queue()
        logging.getLogger("cwp_worker").addHandler(QueueHandler(self.lines))
        logging.getLogger("cwp_worker").setLevel(logging.INFO)
        self.settings = AppSettings.load()
        self.runner: Runner | None = None
        self.client: Client | None = None

        root.title(f"{APP_NAME} · PC app")
        root.minsize(560, 460)
        root.protocol("WM_DELETE_WINDOW", self.quit)
        self.frame = ttk.Frame(root, padding=PAD)
        self.frame.pack(fill="both", expand=True)
        saved = config.load()
        if saved:
            self.client = Client(saved.site, saved.token)
            self.show_main(studio=None)
        else:
            self.show_connect()
        self.root.after(200, self.pump)

    # --- Screens -------------------------------------------------------------

    def clear(self) -> None:
        for child in self.frame.winfo_children():
            child.destroy()

    def show_connect(self) -> None:
        self.clear()
        ttk.Label(self.frame, text="Connect this computer", font=("", 16, "bold")).pack(anchor="w")
        ttk.Label(
            self.frame,
            text="In the dashboard, open Photo delivery → Connect a computer, give it a name and copy the line it shows. Paste it here.",
            wraplength=520,
        ).pack(anchor="w", pady=(4, PAD))
        box = tk.Text(self.frame, height=4, wrap="word")
        box.pack(fill="x")
        status = ttk.Label(self.frame, text="", foreground="#a33", wraplength=520)

        def do_connect() -> None:
            try:
                studio, computer = connect(box.get("1.0", "end"))
            except ValueError as exc:
                status.config(text=str(exc))
                return
            except ApiError as exc:
                status.config(text=f"Couldn't connect: {exc}")
                return
            saved = config.load()
            assert saved
            self.client = Client(saved.site, saved.token)
            self.show_main(studio=f"{studio} · {computer}" if computer else studio)

        ttk.Button(self.frame, text="Connect", command=do_connect).pack(anchor="w", pady=PAD)
        status.pack(anchor="w")

    def show_main(self, studio: str | None) -> None:
        self.clear()
        if studio is None and self.client:
            try:
                me = self.client.me()
                studio = me["studio"]["name"]
            except ApiError as exc:
                studio = f"(can't reach the site: {exc})"
        ttk.Label(self.frame, text=studio or "", font=("", 16, "bold")).pack(anchor="w")

        row = ttk.Frame(self.frame)
        row.pack(fill="x", pady=(PAD, 4))
        ttk.Label(row, text="Folder to watch:").pack(side="left")
        self.folder_var = tk.StringVar(value=self.settings.folder)
        ttk.Entry(row, textvariable=self.folder_var).pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(row, text="Choose…", command=self.choose_folder).pack(side="left")

        self.one_var = tk.BooleanVar(value=self.settings.one_project)
        ttk.Checkbutton(self.frame, text="This folder is one shoot (otherwise each subfolder is a shoot)", variable=self.one_var).pack(anchor="w")
        self.edit_var = tk.BooleanVar(value=self.settings.edit)
        ttk.Checkbutton(self.frame, text="Auto-edit each photo to suit its light", variable=self.edit_var).pack(anchor="w")

        buttons = ttk.Frame(self.frame)
        buttons.pack(fill="x", pady=PAD)
        self.start_btn = ttk.Button(buttons, text="Start", command=self.start)
        self.start_btn.pack(side="left")
        self.stop_btn = ttk.Button(buttons, text="Stop", command=self.stop, state="disabled")
        self.stop_btn.pack(side="left", padx=6)
        ttk.Button(buttons, text="Disconnect", command=self.disconnect).pack(side="right")
        self.state_label = ttk.Label(self.frame, text="Not running. New photos upload while this is running.")
        self.state_label.pack(anchor="w")

        self.log = tk.Text(self.frame, height=14, state="disabled", wrap="word")
        self.log.pack(fill="both", expand=True, pady=(6, 0))
        ttk.Label(self.frame, text=f"Originals stay on this computer. Version {__version__}.", foreground="#777").pack(anchor="w", pady=(6, 0))

    # --- Actions ----------------------------------------------------------------

    def choose_folder(self) -> None:
        chosen = filedialog.askdirectory(initialdir=self.folder_var.get() or None)
        if chosen:
            self.folder_var.set(chosen)

    def start(self) -> None:
        if not self.client:
            return
        self.settings = AppSettings(folder=self.folder_var.get().strip(), one_project=self.one_var.get(), edit=self.edit_var.get())
        self.settings.save()
        self.runner = Runner(self.client, self.settings)
        try:
            self.runner.start()
        except ValueError as exc:
            messagebox.showerror(APP_NAME, str(exc))
            return
        self.start_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self.state_label.config(text="Running: new photos upload as they land. Keep this window open.")

    def stop(self) -> None:
        if self.runner:
            self.state_label.config(text="Stopping after the photos in progress…")
            self.root.update_idletasks()
            self.runner.stop()
        self.start_btn.config(state="normal")
        self.stop_btn.config(state="disabled")
        self.state_label.config(text="Stopped.")

    def disconnect(self) -> None:
        if not messagebox.askyesno(APP_NAME, "Disconnect this computer? You'll need a new connect line from the dashboard."):
            return
        self.stop()
        path = config.config_path()
        if path.exists():
            path.unlink()
        self.client = None
        self.show_connect()

    def pump(self) -> None:
        """Moves log lines into the window and notices a stopped runner."""
        try:
            while True:
                line = self.lines.get_nowait()
                if hasattr(self, "log") and self.log.winfo_exists():
                    self.log.config(state="normal")
                    self.log.insert("end", line + "\n")
                    self.log.see("end")
                    self.log.config(state="disabled")
        except queue.Empty:
            pass
        if self.runner and not self.runner.running and self.runner.error and hasattr(self, "state_label") and self.state_label.winfo_exists():
            self.state_label.config(text=self.runner.error)
            self.start_btn.config(state="normal")
            self.stop_btn.config(state="disabled")
            self.runner = None
        self.root.after(300, self.pump)

    def quit(self) -> None:
        if self.runner and self.runner.running:
            self.runner.stop(timeout=10)
        self.root.destroy()


def main() -> int:
    root = tk.Tk()
    App(root)
    root.mainloop()
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
