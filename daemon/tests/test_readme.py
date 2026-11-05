"""PyPI shows daemon/README.md: the repository's README, whose links and images are absolute for that."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_the_package_readme_is_the_repository_readme() -> None:
    assert (ROOT / "daemon" / "README.md").read_text() == (ROOT / "README.md").read_text(), "cp README.md daemon/"


def test_the_readme_links_only_absolutely_for_pypi() -> None:
    import re

    text = (ROOT / "README.md").read_text()
    relative = [
        u
        for u in re.findall(r'(?:href|src)="([^"]+)"|\]\(([^)]+)\)', text)
        for u in u
        if u and not u.startswith(("http", "#"))
    ]
    assert relative == []
