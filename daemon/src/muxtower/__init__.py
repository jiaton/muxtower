from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("muxtower")  # the one in pyproject.toml, as installed
except PackageNotFoundError:  # pragma: no cover - run without being installed
    __version__ = "0.0.0"
