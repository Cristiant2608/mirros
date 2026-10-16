"""MirrOS: pantalla y control de iPhone para Linux y Windows."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("mirros")
except PackageNotFoundError:
    # Source checkouts work before installation, without a second version constant.
    import re
    from pathlib import Path
    __version__ = re.search(r'^version = "([^"]+)"', (Path(__file__).parents[2] / "pyproject.toml").read_text(), re.M)[1]
