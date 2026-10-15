"""Módulo de detección y diagnóstico de dispositivos iOS."""

import os
import shutil
import subprocess
from typing import List, Optional


def check_usbmuxd_socket() -> bool:
    """Verifica si el socket de usbmuxd está disponible en el sistema."""
    common_sockets = [
        "/var/run/usbmuxd",
        "/run/usbmuxd",
    ]
    return any(os.path.exists(s) for s in common_sockets)


def is_usbmuxd_installed() -> bool:
    """Comprueba si el binario usbmuxd está presente en el PATH."""
    return shutil.which("usbmuxd") is not None


def list_connected_devices() -> List[str]:
    """Lista los UDIDs de los dispositivos conectados vía USB."""
    if shutil.which("idevice_id"):
        try:
            res = subprocess.run(
                ["idevice_id", "-l"],
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
            if res.returncode == 0:
                devices = [d.strip() for d in res.stdout.splitlines() if d.strip()]
                return devices
        except Exception:
            pass
    return []
