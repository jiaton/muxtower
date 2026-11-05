"""PyPI shows daemon/README.md: the repository's README with its images at absolute addresses. The
repository's own README points at its images by path, which GitHub shows also while the repository is
private (a raw.githubusercontent.com address then answers 404 to anyone signed out)."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = "https://raw.githubusercontent.com/jiaton/muxtower/main/"


def for_pypi(readme: str) -> str:
    """The README as PyPI shows it: each image path made an absolute address."""
    return re.sub(r'src="(?!https?:)([^"]+)"', lambda m: f'src="{RAW}{m.group(1)}"', readme)


def test_the_package_readme_is_the_repository_readme_with_absolute_images() -> None:
    expected = for_pypi((ROOT / "README.md").read_text())
    assert (ROOT / "daemon" / "README.md").read_text() == expected, "regenerate daemon/README.md (for_pypi)"


def test_the_readme_images_are_paths_in_the_repository_and_its_links_absolute() -> None:
    text = (ROOT / "README.md").read_text()
    images = re.findall(r'src="([^"]+)"', text)
    assert images and all((ROOT / path).is_file() for path in images if not path.startswith("http"))
    assert not [path for path in images if path.startswith(RAW)]
    links = [u for u in re.findall(r'href="([^"]+)"|\]\(([^)]+)\)', text) for u in u if u]
    assert not [u for u in links if not u.startswith(("http", "#"))]  # PyPI has no repository to resolve them in
