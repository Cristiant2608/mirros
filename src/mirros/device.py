"""Detección USB usando el transporte nativo de pymobiledevice3."""

import asyncio
import os
import socket
from typing import List


def check_usbmuxd_socket() -> bool:
    """Apple usa TCP en Windows; usbmuxd usa un socket Unix en Linux."""
    if os.name == "nt":
        try:
            with socket.create_connection(("127.0.0.1", 27015), timeout=1):
                return True
        except OSError:
            return False
    return any(os.path.exists(p) for p in ("/var/run/usbmuxd", "/run/usbmuxd"))


def list_connected_devices() -> List[str]:
    """No requiere idevice_id; ignora dispositivos descubiertos por Wi-Fi."""
    from pymobiledevice3.usbmux import list_devices

    async def discover():
        return await asyncio.wait_for(list_devices(), timeout=3)

    return [device.serial for device in asyncio.run(discover()) if device.connection_type == "USB"]
