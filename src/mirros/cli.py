"""Interfaz de línea de comandos para MirrOS."""

import argparse
import sys

from mirros import __version__
from mirros.runner import run_mirros


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="mirros",
        description="Visualiza y controla tu iPhone desde Windows o Linux con MirrOS.",
    )

    # Dispositivo y conexión
    device_group = parser.add_argument_group("Dispositivo y conexión")
    device_group.add_argument(
        "-u",
        "--udid",
        type=str,
        default=None,
        help="UDID específico del iPhone si hay más de uno conectado.",
    )
    device_group.add_argument(
        "--no-userspace",
        action="store_true",
        help="No usar el túnel en espacio de usuario (requiere privilegios de root/túnel de kernel).",
    )
    device_group.add_argument(
        "--display-mode",
        choices=["dual", "aod"],
        default="dual",
        help="Modo de pantalla física: 'dual' (evitar reposo) o 'aod' (solicitar reposo experimental; la captura puede detenerse).",
    )
    device_group.add_argument(
        "--list-apps",
        action="store_true",
        help="Lista las aplicaciones de usuario instaladas en el iPhone y termina.",
    )
    device_group.add_argument(
        "--app-switcher",
        action="store_true",
        help="Envía la señal/gesto para abrir el selector de aplicaciones (multitarea) en MirrOS.",
    )
    device_group.add_argument(
        "--launch-app",
        type=str,
        default=None,
        metavar="BUNDLE_ID",
        help="Abre una aplicación de usuario por su identificador (ej. com.apple.Preferences) en la sesión activa.",
    )

    # Transmisión y video
    video_group = parser.add_argument_group("Transmisión y video")
    video_group.add_argument(
        "--force-software",
        action="store_true",
        default=False,
        help="Fuerza la decodificación de video compatible por software (recomendado en Linux sin aceleración de hardware HEVC).",
    )
    video_group.add_argument(
        "--video-quality",
        choices=["economy", "balanced", "detail"],
        default=None,
        help="Perfil de calidad para el modo compatible por software: economy (960p, 20 FPS), balanced (1568p, 30 FPS, por defecto), detail (2160p, 30 FPS).",
    )

    # Audio
    audio_group = parser.add_argument_group("Audio")
    audio_group.add_argument(
        "--audio",
        action="store_true",
        default=False,
        help="Habilita la transmisión de audio (desactivada por defecto).",
    )
    audio_group.add_argument(
        "--no-audio",
        dest="audio",
        action="store_false",
        help="Desactiva el audio (por defecto).",
    )

    # Interfaz y servidor
    server_group = parser.add_argument_group("Interfaz y servidor")
    server_group.add_argument(
        "-p",
        "--port",
        type=int,
        default=None,
        help="Puerto TCP para el servidor local (por defecto: 8080 o el primer puerto libre).",
    )
    server_group.add_argument(
        "-b",
        "--browser",
        type=str,
        default=None,
        help="Ejecutable de navegador específico a utilizar (ej. chromium, brave-browser, msedge).",
    )

    # Diagnóstico e información
    diag_group = parser.add_argument_group("Diagnóstico e información")
    diag_group.add_argument(
        "-v",
        "--version",
        action="version",
        version=f"mirros {__version__}",
        help="Muestra la versión de MirrOS y termina.",
    )
    diag_group.add_argument(
        "--diagnose",
        action="store_true",
        help="Comprueba Python, navegador y USB sin iniciar la transmisión.",
    )

    args = parser.parse_args()

    if args.list_apps:
        from mirros.apps import list_apps_cli
        sys.exit(list_apps_cli(udid=args.udid))
        return

    if args.app_switcher:
        from mirros.apps import app_switcher_cli
        sys.exit(app_switcher_cli(port=args.port))
        return

    if args.launch_app:
        from mirros.apps import launch_app_cli
        sys.exit(launch_app_cli(bundle_id=args.launch_app, port=args.port))
        return

    if args.port is not None and not 1 <= args.port <= 65535:
        parser.error("El puerto debe estar entre 1 y 65535.")

    exit_code = run_mirros(
        port=args.port,
        no_audio=not args.audio,
        userspace=not args.no_userspace,
        udid=args.udid,
        browser_bin=args.browser,
        diagnose=args.diagnose,
        display_mode=args.display_mode,
        force_software=args.force_software,
        video_quality=args.video_quality,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
