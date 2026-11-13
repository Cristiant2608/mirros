"""Command-line interface for MirrOS."""

import argparse
import sys

from mirros import __version__
from mirros.runner import run_mirros


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="mirros",
        description="Mirror and control your iPhone over USB from Windows or Linux with MirrOS.",
    )

    # Device & connection
    device_group = parser.add_argument_group("Device and connection")
    device_group.add_argument(
        "-u",
        "--udid",
        type=str,
        default=None,
        help="Target iPhone UDID when multiple devices are connected.",
    )
    device_group.add_argument(
        "--no-userspace",
        action="store_true",
        help="Disable userspace tunnel (requires root privileges / kernel tunnel).",
    )
    device_group.add_argument(
        "--display-mode",
        choices=["dual", "aod"],
        default="dual",
        help="Physical display mode: 'dual' (prevent sleep) or 'aod' (experimental standby; capture may pause).",
    )
    device_group.add_argument(
        "--list-apps",
        action="store_true",
        help="List user-installed iPhone applications and exit.",
    )
    device_group.add_argument(
        "--app-switcher",
        action="store_true",
        help="Trigger the iOS App Switcher (multitasking) on an active MirrOS session.",
    )
    device_group.add_argument(
        "--launch-app",
        type=str,
        default=None,
        metavar="BUNDLE_ID",
        help="Open a user application by bundle identifier (e.g. com.apple.Preferences) in the active session.",
    )

    # Streaming & video
    video_group = parser.add_argument_group("Streaming and video")
    video_group.add_argument(
        "--force-software",
        action="store_true",
        default=False,
        help="Force software video decoding fallback (recommended on Linux without HEVC hardware decode).",
    )
    video_group.add_argument(
        "--video-quality",
        choices=["economy", "balanced", "detail"],
        default=None,
        help="Software fallback quality profile: economy (960p, 20 FPS), balanced (1568p, 30 FPS, default), detail (2160p, 30 FPS).",
    )

    # Audio
    audio_group = parser.add_argument_group("Audio")
    audio_group.add_argument(
        "--audio",
        action="store_true",
        default=False,
        help="Enable PCM audio streaming (disabled by default).",
    )
    audio_group.add_argument(
        "--no-audio",
        dest="audio",
        action="store_false",
        help="Disable audio streaming (default).",
    )

    # UI & server
    server_group = parser.add_argument_group("Interface and server")
    server_group.add_argument(
        "-p",
        "--port",
        type=int,
        default=None,
        help="TCP port for the local server (default: 8080 or next available port).",
    )
    server_group.add_argument(
        "-b",
        "--browser",
        type=str,
        default=None,
        help="Specific browser binary to launch (e.g. chromium, brave-browser, msedge).",
    )
    server_group.add_argument(
        "--studio",
        action="store_true",
        default=False,
        help="Open the full Studio panel instead of the compact phone-only floating view.",
    )
    server_group.add_argument(
        "--floating",
        action="store_true",
        default=False,
        help="Open only the compact floating phone view with its docked controls rail (default).",
    )
    server_group.add_argument(
        "--lang",
        choices=["en", "es"],
        default=None,
        help="UI language override: 'en' (English, default) or 'es' (Spanish).",
    )

    # Diagnostics & info
    diag_group = parser.add_argument_group("Diagnostics and information")
    diag_group.add_argument(
        "-v",
        "--version",
        action="version",
        version=f"mirros {__version__}",
        help="Show MirrOS version and exit.",
    )
    diag_group.add_argument(
        "--diagnose",
        action="store_true",
        help="Check Python, browser, and USB availability without starting a stream.",
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
        parser.error("Port must be between 1 and 65535.")

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
        ui_mode="studio" if args.studio and not args.floating else "phone",
        lang=args.lang,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
