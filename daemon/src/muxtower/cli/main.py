"""`muxtower`: the one command.

muxtower                 status: daemon, sessions (and those a restart interrupted, to start again)
muxtower run AGENT ...   start an agent in a managed tmux session (starts the daemon if needed)
muxtower attach [NAME]   open a session in this terminal (one a restart interrupted is started again first)
muxtower pair            add a device with a one-time code (--join HUB: join a hub as a node)
muxtower expose tailscale HTTPS on your tailnet (tailscale serve), set as public_url
muxtower serve           run the daemon in the foreground (for systemd, Docker)
muxtower --version       this install's version, and the hub links it speaks
"""

import argparse
import os
import shutil
import sqlite3
import sys

from muxtower import __version__
from muxtower.cli.client import DaemonError, LocalDaemon
from muxtower.cli.expose import add_expose_parser
from muxtower.cli.pair import cmd_pair
from muxtower.cli.recover import offer, start_again
from muxtower.cli.serve import add_serve_parser
from muxtower.config import load_settings
from muxtower.infra.db import Database
from muxtower.nodes.protocol import OLDEST, PROTOCOL
from muxtower.sources.remote_control.lineage_store import SqliteLineageStore


def _attach(session: dict[str, str]) -> int:
    if not session.get("tmux_pane"):
        print(
            f"{session['name']} does not run in tmux here ({session.get('source')}); open it in the app",
            file=sys.stderr,
        )
        return 1
    tmux = shutil.which("tmux") or "tmux"
    socket = session["tmux_socket"]
    pane = session["tmux_pane"]
    base = ["tmux"] + ([] if socket == "default" else ["-L", socket])
    # Attach to the pane's session, then bring that exact pane forward (a session may have many).
    argv = [*base, "attach", "-t", pane, ";", "select-window", "-t", pane, ";", "select-pane", "-t", pane]
    env = {k: v for k, v in os.environ.items() if k != "TMUX"}  # allow attaching from inside tmux
    os.execve(tmux, argv, env)  # noqa: S606 - replaces this process with tmux attach


def cmd_status(_: argparse.Namespace, daemon: LocalDaemon) -> int:
    if not daemon.running():
        print(f"daemon: not running ({daemon.url}); `muxtower run <agent>` starts it\n")
        print(__doc__.split("\n", 2)[2] if __doc__ else "")
        return 0
    sessions = daemon.request("GET", "/v1/sessions")
    running = daemon.request("GET", "/v1/health").get("version")
    print(
        f"daemon: muxtower {running} running at {daemon.url}"
        + (f", public at {daemon.settings.public_url}" if daemon.settings.public_url else "")
    )
    if running != __version__:
        print(f"  muxtower {__version__} is installed: restart the daemon to run it")
    hub = daemon.request("GET", "/v1/hub")
    if hub.get("url"):
        state = "connected" if hub["connected"] else f"not connected ({hub.get('error') or 'linking'})"
        print(f"node {hub['name']} of {hub['url']}: {state}")
        if hub.get("update"):
            print(f"  the hub runs muxtower {hub['update']}: pipx install --force muxtower=={hub['update']}")
    for node in daemon.request("GET", "/v1/nodes"):
        print(f"node {node['name']}: {'online' if node['online'] else 'offline'}, {node['sessions']} sessions")
        if node.get("update"):
            print(f"  runs muxtower {node['version']}; this daemon runs {node['update']}")
    if not sessions:
        print("no sessions; start one with `muxtower run claude`")
    for s in sessions:
        if s.get("interrupted_at"):
            continue  # listed below, to start again
        flag = "!" if s["needs_attention"] else " "
        print(f" {flag} {s['name']:<24} {s['state']:<17} {s['runtime']:<12} {s['source']}")
    offer(daemon, sessions)
    return 0


def cmd_run(args: argparse.Namespace, daemon: LocalDaemon) -> int:
    daemon.ensure_running()
    body = {"runtime": args.agent, "cwd": os.getcwd(), "name": args.name, "args": args.args}
    session = daemon.request("POST", "/v1/sessions", body)
    print(f"started {session['name']} ({session['runtime']})")
    if args.detach or not sys.stdin.isatty():
        print(f"attach with: muxtower attach {session['name']}")
        return 0
    return _attach(session)


def cmd_attach(args: argparse.Namespace, daemon: LocalDaemon) -> int:
    sessions = daemon.request("GET", "/v1/sessions")
    if args.name:
        sessions = [s for s in sessions if args.name in (s["id"], s["name"]) or args.name in s["name"]]
    if not sessions:
        print("no matching session", file=sys.stderr)
        return 1
    if len(sessions) > 1:
        for i, s in enumerate(sessions, 1):
            print(f"  {i}. {s['name']}  ({s['state']}, {s['runtime']})")
        choice = input("attach to: ").strip()
        if not choice.isdigit() or not 1 <= int(choice) <= len(sessions):
            return 1
        sessions = [sessions[int(choice) - 1]]
    if sessions[0].get("interrupted_at"):
        (sessions[0],) = start_again(daemon, sessions[:1]) or [sessions[0]]
        print(f"started {sessions[0]['name']} again")
    return _attach(sessions[0])


def cmd_forget_lineage(args: argparse.Namespace, _: LocalDaemon) -> int:
    """Forgets where Remote Control sessions came from (a fork placed wrong): worked out again at the next
    start. Works on this daemon's database directly; restart it after."""
    if not args.session_id and not args.all:
        print("muxtower: name a session id, or --all", file=sys.stderr)
        return 2
    db = Database(load_settings().db_path)
    try:
        gone = SqliteLineageStore(db).forget(None if args.all else args.session_id)
    except sqlite3.OperationalError as exc:
        print(f"muxtower: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()
    print(f"forgot {gone} session lineage{'s' if gone != 1 else ''}; restart the daemon to work them out again")
    return 0


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="muxtower", description="Approve and drive coding agents from your phone.")
    links = str(PROTOCOL) if OLDEST == PROTOCOL else f"{OLDEST}..{PROTOCOL}"
    p.add_argument("--version", action="version", version=f"muxtower {__version__} (hub link protocol {links})")
    sub = p.add_subparsers(dest="command")

    run = sub.add_parser("run", help="start an agent in a managed tmux session")
    run.add_argument("-n", "--name", help="display name (default: the directory name)")
    run.add_argument("-d", "--detach", action="store_true", help="do not attach")
    run.add_argument("agent", help="runtime or binary, e.g. claude, codex")
    run.add_argument("args", nargs=argparse.REMAINDER, help="passed to the agent")
    run.set_defaults(func=cmd_run)

    attach = sub.add_parser("attach", help="open a session in this terminal")
    attach.add_argument("name", nargs="?", help="session name, part of it, or id")
    attach.set_defaults(func=cmd_attach)

    pair = sub.add_parser("pair", help="add a device: QR code + one-time code")
    pair.add_argument("--url", help="address the device reaches this daemon at")
    pair.add_argument("--app", help="hosted app URL to open instead of the daemon's own UI")
    pair.add_argument("--revoke", metavar="NAME", help="revoke a paired device instead")
    pair.add_argument("--join", metavar="HUB", help="join this daemon to a hub as a node, e.g. https://hub.example")
    pair.add_argument("--code", help="with --join: a pairing code made on the hub (`muxtower pair` there)")
    pair.add_argument("--leave", action="store_true", help="stop reporting to the hub this daemon joined")
    pair.set_defaults(func=cmd_pair)

    forget = sub.add_parser(
        "forget-lineage", help="forget where Remote Control sessions came from (a fork placed wrong); then restart"
    )
    forget.add_argument("session_id", nargs="?", help="its id (cse_…)")
    forget.add_argument("--all", action="store_true", help="every session's")
    forget.set_defaults(func=cmd_forget_lineage)

    add_expose_parser(sub)

    add_serve_parser(sub)

    args = p.parse_args(argv)
    if args.command == "serve":
        sys.exit(args.func(args))
    daemon = LocalDaemon(load_settings())
    try:
        sys.exit(getattr(args, "func", cmd_status)(args, daemon))
    except DaemonError as exc:
        print(f"muxtower: {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
