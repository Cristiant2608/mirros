"""Entrada del backend; las adaptaciones a pymobiledevice3 están aisladas."""

import runpy
from mirros.adapter import configure_viewer


def main() -> None:
    configure_viewer()
    runpy.run_module("pymobiledevice3", run_name="__main__")


if __name__ == "__main__":
    main()
