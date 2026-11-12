"""cwp-worker: upload a shoot from your computer as the photos land.

  cwp-worker login --site https://… --token cwp_wk_…
  cwp-worker projects
  cwp-worker upload "~/Pictures/Meera 30th" [--project meera-30th]
  cwp-worker watch "~/Google Drive/Shoots" [--project slug] [--interval 10]
  cwp-worker edit "~/Pictures/Meera 30th" [--look golden-glow] [--sheet]
  cwp-worker looks

Add --edit to upload or watch to auto-edit each photo before it goes up.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

from . import __version__, config
from .api import ApiError, Client, Project
from .scan import Settler
from .sync import Stats, Watcher, default_workers, upload_folder

log = logging.getLogger("cwp_worker")


def _client() -> Client:
    cfg = config.load()
    if not cfg:
        raise SystemExit("Not connected yet. In the dashboard open Photo delivery → Connect a PC, and run the login command it shows.")
    return Client(cfg.site, cfg.token)


def _folder(value: str) -> Path:
    path = Path(value).expanduser().resolve()
    if not path.is_dir():
        raise SystemExit(f"Not a folder: {path}")
    return path


def _project(client: Client, slug_or_name: str | None, folder: Path) -> Project:
    """The project to upload into: by short name or id, else named after the folder."""
    if slug_or_name:
        for p in client.projects():
            if slug_or_name in (p["slug"], p["id"]):
                return Project(p["id"], p["name"], p["slug"], p["status"])
        raise SystemExit(f'No project "{slug_or_name}". Run `cwp-worker projects` to see their short names.')
    project, created = client.ensure_project(folder.name)
    print(f'{"Created" if created else "Using"} project "{project.name}" ({project.slug})')
    return project


def _summary(stats: Stats) -> int:
    print(f"Uploaded {stats.uploaded} photo{'s' if stats.uploaded != 1 else ''}" + (f", {stats.skipped} already there" if stats.skipped else "") + ".")
    if stats.failed:
        print(f"{len(stats.failed)} failed:")
        for name, error in list(stats.failed.items())[:20]:
            print(f"  {name}: {error}")
    if stats.stopped:
        print(f"Stopped: {stats.stopped}")
    return 1 if stats.failed or stats.stopped else 0


def cmd_login(args: argparse.Namespace) -> int:
    client = Client(args.site, args.token)
    try:
        me = client.me()
    except ApiError as exc:
        print(f"Couldn't connect: {exc}", file=sys.stderr)
        return 1
    path = config.save(config.Config(args.site.rstrip("/"), args.token))
    print(f'Connected as "{me["computer"]}" to {me["studio"]["name"]}. Saved to {path}.')
    if me.get("blocked"):
        print(f"Note: {me['blocked']}")
    return 0


def cmd_app(_: argparse.Namespace) -> int:
    from .app import main as app_main  # Tkinter is only needed for the window

    return app_main()


def cmd_projects(_: argparse.Namespace) -> int:
    projects = _client().projects()
    if not projects:
        print("No projects yet.")
    for p in projects:
        print(f"{p['slug']:<32} {p['photoCount']:>6} photos  {p['status']:<10} {p['name']}")
    return 0


def _check_look(look: str | None) -> None:
    if look:
        from .looks import get_look

        try:
            get_look(look)
        except KeyError as exc:
            raise SystemExit(str(exc).strip("\"'")) from None


def cmd_upload(args: argparse.Namespace) -> int:
    _check_look(args.look)
    client = _client()
    folder = _folder(args.folder)
    project = _project(client, args.project, folder)
    stats = upload_folder(client, project, folder, Settler(min_age=args.min_age), workers=args.workers, wait=time.sleep, edit=args.edit, look=args.look)
    return _summary(stats)


def cmd_watch(args: argparse.Namespace) -> int:
    _check_look(args.look)
    client = _client()
    root = _folder(args.folder)
    project = _project(client, args.project, root) if args.project else None
    watcher = Watcher(client, root, project=project, settler=Settler(min_age=args.min_age), workers=args.workers, edit=args.edit, look=args.look)
    try:
        watcher.run(args.interval, time.sleep)
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


def cmd_looks(_: argparse.Namespace) -> int:
    from .looks import LIGHTING_LABELS, LOOKS_BY_GROUP
    from .looks.recipes import DEFAULT_LOOK

    for group, looks in LOOKS_BY_GROUP.items():
        print(f"{LIGHTING_LABELS[group]}:")
        for look in looks:
            star = " (default)" if DEFAULT_LOOK[group] == look.id else ""
            print(f"  {look.id:<16} {look.name}{star}: {look.description}")
    return 0


def cmd_edit(args: argparse.Namespace) -> int:
    """Edits a folder's photos into a new folder next to it. Originals are never touched."""
    import csv

    from .images import FULL_LONG_EDGE, open_upright, web_size
    from .looks import LOOKS_BY_GROUP, edit
    from .scan import file_name_in_project, photos_in
    from .sheet import contact_sheet

    _check_look(args.look)
    folder = _folder(args.folder)
    out = Path(args.out).expanduser().resolve() if args.out else folder.parent / f"{folder.name} (edited)"
    if out == folder or folder in out.parents:
        raise SystemExit("Choose an output folder outside the photos folder.")
    out.mkdir(parents=True, exist_ok=True)
    photos = photos_in(folder)
    if not photos:
        print("No photos found.")
        return 0

    rows: list[tuple[str, list]] = []
    report = []
    for i, path in enumerate(photos, 1):
        name = file_name_in_project(folder, path)
        try:
            image, _, exif = open_upright(path)
        except (OSError, ValueError, SyntaxError) as exc:
            print(f"  skipped {name}: {exc}")
            continue
        working = image if args.full else web_size(image, FULL_LONG_EDGE)
        result = edit(working, look_id=args.look, seed=path.name.encode(), exif=exif)
        target = (out / name).with_suffix(".jpg")
        target.parent.mkdir(parents=True, exist_ok=True)
        result.image.save(target, "JPEG", quality=92, optimize=True, progressive=True)
        report.append({"file": name, "lighting": result.lighting.group, "confidence": result.lighting.confidence, "look": result.look.id})
        print(f"[{i}/{len(photos)}] {name}: {result.lighting.label} → {result.look.name}")
        if args.sheet:
            cells = [("Original", web_size(image, 720)), (f"{result.look.name} (picked)", result.image)]
            if args.all_looks:
                small = web_size(image, 720)
                for look in LOOKS_BY_GROUP[result.lighting.group]:
                    if look.id != result.look.id:
                        cells.append((look.name, edit(small, look_id=look.id, seed=path.name.encode(), exif=exif).image))
            rows.append((f"{name} · {result.lighting.label} ({result.lighting.confidence:.0%} sure)", cells))

    with (out / "looks.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["file", "lighting", "confidence", "look"])
        writer.writeheader()
        writer.writerows(report)
    if args.sheet and rows:
        for n in range(0, len(rows), 8):
            contact_sheet(rows[n : n + 8], f"{folder.name}: before / after").save(out / f"_sheet-{n // 8 + 1}.jpg", quality=88)
    print(f"Done. Edited photos are in {out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cwp-worker", description="Upload a shoot's photos from this computer.")
    parser.add_argument("--version", action="version", version=f"cwp-worker {__version__}")
    parser.add_argument("-v", "--verbose", action="store_true", help="show each file as it uploads")
    sub = parser.add_subparsers(dest="command", required=True)

    login = sub.add_parser("login", help="connect this computer to your studio")
    login.add_argument("--site", required=True, help="your app's address, e.g. https://app.example.in")
    login.add_argument("--token", required=True, help="the cwp_wk_… key from Connect a PC")
    login.set_defaults(run=cmd_login)

    sub.add_parser("app", help="open the PC app window").set_defaults(run=cmd_app)
    sub.add_parser("projects", help="list your projects and their short names").set_defaults(run=cmd_projects)
    sub.add_parser("looks", help="list the 25 looks").set_defaults(run=cmd_looks)

    edit_cmd = sub.add_parser("edit", help="auto-edit a folder into a new folder next to it (no upload)")
    edit_cmd.add_argument("folder")
    edit_cmd.add_argument("--out", help='output folder (default: "<folder> (edited)" next to it)')
    edit_cmd.add_argument("--look", help="use this look for every photo instead of picking one")
    edit_cmd.add_argument("--full", action="store_true", help="edit at full resolution (slower) instead of 2400 px")
    edit_cmd.add_argument("--sheet", action="store_true", help="also save before/after contact sheets")
    edit_cmd.add_argument("--all-looks", action="store_true", help="with --sheet, show every look of the photo's light")
    edit_cmd.set_defaults(run=cmd_edit)

    for name, run, about in (
        ("upload", cmd_upload, "upload a folder's new photos once, then stop"),
        ("watch", cmd_watch, "keep uploading new photos as they land"),
    ):
        p = sub.add_parser(name, help=about)
        p.add_argument("folder")
        p.add_argument("--project", help="short name or id of the project (default: named after the folder)" if name == "upload" else "upload the folder into this one project instead of one project per subfolder")
        p.add_argument("--workers", type=int, default=default_workers(), help="photos uploaded at once (default 3)")
        p.add_argument("--min-age", type=float, default=2.0, help="seconds a file must be unchanged before upload")
        p.add_argument("--edit", action="store_true", help="auto-edit each photo (guests see the edit; the plain copy is kept too)")
        p.add_argument("--look", help="with --edit, use this look for every photo (see `cwp-worker looks`)")
        if name == "watch":
            p.add_argument("--interval", type=float, default=10.0, help="seconds between folder checks")
        p.set_defaults(run=run)
    return parser


def _safe_output() -> None:
    """Windows consoles may not be UTF-8: print "→" and "·" as best they can instead of crashing."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(errors="replace")
            except (ValueError, OSError):  # pragma: no cover - stream already in use in an odd way
                pass


def main(argv: list[str] | None = None) -> int:
    _safe_output()
    # The installed app (a frozen build) opens its window when started with no arguments.
    if argv is None and getattr(sys, "frozen", False) and len(sys.argv) == 1:
        argv = ["app"]
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose or args.command == "watch" else logging.WARNING, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    try:
        return args.run(args)
    except ApiError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
