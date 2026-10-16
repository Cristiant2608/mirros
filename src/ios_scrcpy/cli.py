"""Interfaz de línea de comandos para ios-scrcpy."""

import argparse
import sys

from ios_scrcpy import __version__
from ios_scrcpy.runner import run_ios_scrcpy


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="ios-scrcpy",
        description="Visualiza y controla tu iPhone desde Windows o Linux, similar a scrcpy.",
    )
    parser.add_argument(
        "-v",
        "--version",
        action="version",
        version=f"ios-scrcpy {__version__}",
    )
    parser.add_argument(
        "-p",
        "--port",
        type=int,
        default=None,
        help="Puerto TCP para el servidor local (por defecto: 8080 o el primer puerto libre).",
    )
    parser.add_argument(
        "--audio",
        action="store_true",
        default=False,
        help="Habilita la transmisión de audio (desactivada por defecto).",
    )
    parser.add_argument(
        "--no-userspace",
        action="store_true",
        help="No usar el túnel en espacio de usuario (requiere privilegios de root/túnel de kernel).",
    )
    parser.add_argument(
        "-u",
        "--udid",
        type=str,
        default=None,
        help="UDID específico del iPhone si hay más de uno conectado.",
    )
    parser.add_argument(
        "-b",
        "--browser",
        type=str,
        default=None,
        help="Ejecutable de navegador específico a utilizar (ej. chromium, brave-browser).",
    )

    parser.add_argument("--no-audio", dest="audio", action="store_false", help="Desactiva el audio (por defecto).")
    parser.add_argument("--diagnose", action="store_true", help="Comprueba Python, navegador y USB sin iniciar la transmisión.")

    args = parser.parse_args()
    if args.port is not None and not 1 <= args.port <= 65535:
        parser.error("El puerto debe estar entre 1 y 65535.")

    exit_code = run_ios_scrcpy(
        port=args.port,
        no_audio=not args.audio,
        userspace=not args.no_userspace,
        udid=args.udid,
        browser_bin=args.browser,
        diagnose=args.diagnose,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
