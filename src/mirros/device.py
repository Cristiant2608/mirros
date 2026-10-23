"""Detección USB y preflight de confianza/Modo Desarrollador usando pymobiledevice3."""

import asyncio
import contextlib
import os
import socket
from typing import Any, List


def check_usbmuxd_socket() -> bool:
    """Apple usa TCP en Windows; usbmuxd usa un socket Unix en Linux."""
    if os.name == "nt":
        try:
            with socket.create_connection(("127.0.0.1", 27015), timeout=1):
                return True
        except OSError:
            return False
    for path in ("/var/run/usbmuxd", "/run/usbmuxd"):
        if os.path.exists(path):
            try:
                with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
                    s.settimeout(1)
                    s.connect(path)
                    return True
            except OSError:
                continue
    return False


def list_connected_devices() -> List[str]:
    """No requiere idevice_id; ignora dispositivos descubiertos por Wi-Fi."""
    from pymobiledevice3.usbmux import list_devices

    async def discover():
        return await asyncio.wait_for(list_devices(), timeout=3)

    return [device.serial for device in asyncio.run(discover()) if device.connection_type == "USB"]


async def inspect_device(udid: str, reveal_developer_mode: bool = True) -> dict[str, Any]:
    """Inspecciona un iPhone por USB: verifica confianza, versión de iOS y Modo Desarrollador."""
    from packaging.version import Version
    from pymobiledevice3.exceptions import (
        NotPairedError,
        PairingDialogResponsePendingError,
        PairingError,
        PasscodeRequiredError,
        PasswordRequiredError,
        UserDeniedPairingError,
    )
    from pymobiledevice3.lockdown import create_using_usbmux
    from mirros.diagnostics import record_diagnostic_error

    pairing_errors = (
        NotPairedError,
        PairingDialogResponsePendingError,
        PairingError,
        PasscodeRequiredError,
        PasswordRequiredError,
        UserDeniedPairingError,
    )
    info: dict[str, Any] = {
        "udid": udid,
        "name": "iPhone",
        "version": "",
        "paired": True,
        "developer_mode": True,
        "developer_mode_revealed": False,
        "userspace_supported": True,
    }
    try:
        async with await asyncio.wait_for(create_using_usbmux(serial=udid, autopair=False), timeout=5) as lockdown:
            all_values = getattr(lockdown, "all_values", None) or {}
            version_str = getattr(lockdown, "product_version", "") or all_values.get("ProductVersion") or ""
            if version_str and version_str != "1.0":
                info["version"] = str(version_str)
            paired = getattr(lockdown, "paired", True)
            if not paired:
                pair_fn = getattr(lockdown, "pair", None)
                validate_fn = getattr(lockdown, "validate_pairing", None)
                if callable(pair_fn):
                    try:
                        await asyncio.wait_for(pair_fn(timeout=0), timeout=2)
                        if callable(validate_fn):
                            paired = bool(await asyncio.wait_for(validate_fn(), timeout=2))
                        else:
                            paired = True
                    except Exception:
                        paired = False
            if not paired:
                info["paired"] = False
                record_diagnostic_error("usb_not_paired")
                return info

            all_values = getattr(lockdown, "all_values", None) or {}
            info["name"] = all_values.get("DeviceName") or "iPhone"
            version_str = getattr(lockdown, "product_version", "") or all_values.get("ProductVersion") or info["version"]
            if version_str:
                info["version"] = str(version_str)
                with contextlib.suppress(Exception):
                    info["userspace_supported"] = Version(str(version_str)) >= Version("17.4")

            has_dev_mode = getattr(lockdown, "has_developer_mode", None)
            if has_dev_mode is None and info["version"]:
                with contextlib.suppress(Exception):
                    has_dev_mode = Version(info["version"]) >= Version("16.0")
            if has_dev_mode is not False:
                get_dev = getattr(lockdown, "get_developer_mode_status", None)
                if callable(get_dev):
                    with contextlib.suppress(Exception):
                        enabled = bool(await asyncio.wait_for(get_dev(), timeout=3))
                        info["developer_mode"] = enabled
                        if not enabled:
                            record_diagnostic_error("developer_mode_disabled")
                            if reveal_developer_mode:
                                from pymobiledevice3.services.amfi import AmfiService
                                await asyncio.wait_for(
                                    AmfiService(lockdown).reveal_developer_mode_option_in_ui(),
                                    timeout=3,
                                )
                                info["developer_mode_revealed"] = True
    except pairing_errors:
        info["paired"] = False
        record_diagnostic_error("usb_not_paired")
    except Exception:
        pass
    return info


async def inspect_connected_devices(reveal_developer_mode: bool = True) -> List[dict[str, Any]]:
    """Lista los dispositivos USB conectados con su estado de confianza, túnel y Modo Desarrollador."""
    from pymobiledevice3.usbmux import list_devices

    devices = await asyncio.wait_for(list_devices(), timeout=4)
    result = []
    for device in devices:
        if device.connection_type != "USB":
            continue
        result.append(await inspect_device(device.serial, reveal_developer_mode=reveal_developer_mode))
    return result
