"""Export a small allowlisted report without device identifiers or raw logs."""
import argparse
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
import json
import os
from pathlib import Path
import platform
import shutil
import sys

ALLOWED_ERROR_CODES = frozenset({
    'transport_closed',
    'video_stalled',
    'clipboard_unavailable',
    'apps_unavailable',
    'app_launch_failed',
    'app_switcher_failed',
    'wake_failed',
    'aod_failed',
    'orientation_unavailable',
    'usb_unavailable',
    'usb_not_paired',
    'developer_mode_disabled',
    'media_in_use',
    'media_pause_failed',
    'style_failed',
})
_RECENT_ERRORS = []
_MAX_RECENT_ERRORS = 20


def record_diagnostic_error(code: str) -> None:
    """Record an allowlisted error code with UTC timestamp; never store raw exception messages."""
    if code not in ALLOWED_ERROR_CODES:
        return
    _RECENT_ERRORS.append({
        'code': code,
        'at': datetime.now(timezone.utc).isoformat(),
    })
    if len(_RECENT_ERRORS) > _MAX_RECENT_ERRORS:
        del _RECENT_ERRORS[:-_MAX_RECENT_ERRORS]


def clear_diagnostic_errors() -> None:
    _RECENT_ERRORS.clear()


def collect_report(probe_usb=False):
    packages = {}
    for name in ('mirros', 'pymobiledevice3', 'av', 'pmd-pytcp'):
        try:
            packages[name] = version(name)
        except PackageNotFoundError:
            packages[name] = None
    report = {
        'schema_version': 1,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'runtime': {'python': platform.python_version(), 'platform': sys.platform,
                    'architecture': platform.machine()},
        'packages': packages,
        'tools': {name: shutil.which(name) is not None for name in
                  ('node', 'wl-copy', 'wl-paste', 'chromium', 'google-chrome', 'msedge')},
        'desktop': {'wayland': bool(os.environ.get('WAYLAND_DISPLAY'))},
        'usb': {'status': 'not_probed'},
        'recent_errors': list(_RECENT_ERRORS),
    }
    if probe_usb:
        from mirros.device import list_connected_devices
        try:
            report['usb'] = {'status': 'ok', 'device_count': len(list_connected_devices())}
        except Exception:
            # Exceptions may contain serials, paths or device names: never export them.
            record_diagnostic_error('usb_unavailable')
            report['usb'] = {'status': 'unavailable'}
    return report


def write_report(report, path):
    """Create a private file; never overwrite an existing file or follow a symlink."""
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
        output.write('\n')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Exporta diagnóstico sin nombres, UDID, rutas ni portapapeles.')
    parser.add_argument('--output', type=Path, help='Crear un JSON nuevo; no sobrescribe archivos existentes.')
    parser.add_argument('--probe-usb', action='store_true', help='Consultar USB; exporta solo el número de dispositivos.')
    args = parser.parse_args(argv)
    report = collect_report(args.probe_usb)
    if args.output:
        try:
            write_report(report, args.output)
        except OSError:
            parser.exit(1, 'No se pudo crear el informe. Usa una ruta nueva en una carpeta con permisos.\n')
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
