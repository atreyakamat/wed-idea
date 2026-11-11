"""cwp-worker: upload a shoot from your computer as the photos land.

  cwp-worker login --site https://… --token cwp_wk_…
  cwp-worker projects
  cwp-worker upload "~/Pictures/Meera 30th" [--project meera-30th]
  cwp-worker watch "~/Google Drive/Shoots" [--project slug] [--interval 10]
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


def cmd_projects(_: argparse.Namespace) -> int:
    projects = _client().projects()
    if not projects:
        print("No projects yet.")
    for p in projects:
        print(f"{p['slug']:<32} {p['photoCount']:>6} photos  {p['status']:<10} {p['name']}")
    return 0


def cmd_upload(args: argparse.Namespace) -> int:
    client = _client()
    folder = _folder(args.folder)
    project = _project(client, args.project, folder)
    stats = upload_folder(client, project, folder, Settler(min_age=args.min_age), workers=args.workers, wait=time.sleep)
    return _summary(stats)


def cmd_watch(args: argparse.Namespace) -> int:
    client = _client()
    root = _folder(args.folder)
    project = _project(client, args.project, root) if args.project else None
    watcher = Watcher(client, root, project=project, settler=Settler(min_age=args.min_age), workers=args.workers)
    try:
        watcher.run(args.interval, time.sleep)
    except KeyboardInterrupt:
        print("\nStopped.")
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

    sub.add_parser("projects", help="list your projects and their short names").set_defaults(run=cmd_projects)

    for name, run, about in (
        ("upload", cmd_upload, "upload a folder's new photos once, then stop"),
        ("watch", cmd_watch, "keep uploading new photos as they land"),
    ):
        p = sub.add_parser(name, help=about)
        p.add_argument("folder")
        p.add_argument("--project", help="short name or id of the project (default: named after the folder)" if name == "upload" else "upload the folder into this one project instead of one project per subfolder")
        p.add_argument("--workers", type=int, default=default_workers(), help="photos uploaded at once (default 3)")
        p.add_argument("--min-age", type=float, default=2.0, help="seconds a file must be unchanged before upload")
        if name == "watch":
            p.add_argument("--interval", type=float, default=10.0, help="seconds between folder checks")
        p.set_defaults(run=run)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose or args.command == "watch" else logging.WARNING, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    try:
        return args.run(args)
    except ApiError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
