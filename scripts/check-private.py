#!/usr/bin/env python3
"""Fails when a private term is in the repository: in a tracked file, or in the message of a commit not yet
pushed. The terms are never part of the repository: they come from the environment (`PRIVATE_TERMS`, one
per line: CI's secret of that name) or a local file (`MUXTOWER_PRIVATE_TERMS`, else
~/.config/muxtower/private-terms.txt). One per line, matched case-insensitively as text; a line starting
"re:" is a regular expression; blank lines and "#" comments are skipped. Without a list there is nothing to
check (a notice, exit 0). A finding names the term by its number in the list, never the term itself.

    python3 scripts/check-private.py            # tracked files + messages of origin/main..HEAD
    python3 scripts/check-private.py A..B       # tracked files + messages of that range (pre-push)
"""

import os
import re
import subprocess
import sys
from pathlib import Path


def terms() -> list[re.Pattern[str]]:
    text = os.environ.get("PRIVATE_TERMS")
    if not text:
        path = Path(os.environ.get("MUXTOWER_PRIVATE_TERMS", "~/.config/muxtower/private-terms.txt")).expanduser()
        text = path.read_text(encoding="utf-8") if path.is_file() else ""
    found = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        found.append(re.compile(line[3:] if line.startswith("re:") else re.escape(line), re.IGNORECASE))
    return found


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=False).stdout


def main() -> int:
    patterns = terms()
    if not patterns:
        print("check-private: no list of private terms here (PRIVATE_TERMS or ~/.config/muxtower/private-terms.txt): skipped")
        return 0
    findings = []
    for name in git("ls-files", "-z").split("\0"):
        if not name or not os.path.isfile(name):
            continue
        data = Path(name).read_bytes()
        if b"\0" in data[:8192]:
            continue  # binary
        text = data.decode("utf-8", errors="replace")
        findings += [f"private term #{i + 1} in {name}" for i, p in enumerate(patterns) if p.search(text)]
    span = sys.argv[1] if len(sys.argv) > 1 else ("origin/main..HEAD" if git("rev-parse", "-q", "--verify", "origin/main") else "-1")
    for commit in git("log", "--format=%H", span).split():
        message = git("log", "-1", "--format=%B", commit)
        findings += [f"private term #{i + 1} in the message of {commit[:12]}" for i, p in enumerate(patterns) if p.search(message)]
    if findings:
        print("\n".join(findings))
        print(f"check-private: {len(findings)} finding(s): take them out before this is pushed")
        return 1
    print(f"check-private: no private term ({len(patterns)} checked)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
