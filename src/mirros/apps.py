"""Application management and multitasking shortcuts for MirrOS."""

import asyncio
import json
from typing import Optional
from urllib.request import Request, urlopen


def list_apps_cli(udid: Optional[str] = None) -> int:
    """List user-installed iPhone applications from the terminal."""
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.services.installation_proxy import InstallationProxyService
    from mirros.device import check_usbmuxd_socket, list_connected_devices

    if not check_usbmuxd_socket():
        print("[!] The usbmuxd service is unavailable.")
        return 1

    try:
        devices = list_connected_devices()
    except Exception as error:
        print(f"[!] Could not query USB ({type(error).__name__}).")
        return 1
    if not devices:
        print("[!] No iPhone detected over USB.")
        return 1
    if udid and udid not in devices:
        print(f"[!] Device {udid} not found. Available: {', '.join(devices)}")
        return 1
    if not udid and len(devices) > 1:
        print("[!] Multiple devices found. Use --udid with one of: " + ", ".join(devices))
        return 1
    target = udid or devices[0]

    async def _fetch():
        async with await asyncio.wait_for(create_using_usbmux(serial=target), timeout=5) as lockdown:
            async with InstallationProxyService(lockdown) as service:
                return await asyncio.wait_for(service.get_apps(application_type="User"), timeout=15)

    try:
        print(f"[*] Connecting to iPhone ({target})...", flush=True)
        apps = asyncio.run(_fetch())
        if not apps:
            print("[+] No user applications found.")
            return 0
        sorted_apps = sorted(
            apps.items(),
            key=lambda x: (x[1].get("CFBundleDisplayName") or x[1].get("CFBundleName") or x[0]).lower(),
        )
        print(f"[+] {len(sorted_apps)} applications found:\n")
        for bundle_id, data in sorted_apps:
            name = data.get("CFBundleDisplayName") or data.get("CFBundleName") or bundle_id
            version = data.get("CFBundleShortVersionString") or data.get("CFBundleVersion") or ""
            v_str = f" (v{version})" if version else ""
            print(f"  • {name}{v_str}")
            print(f"    ID: {bundle_id}")
        return 0
    except Exception as error:
        print(f"[!] Error listing applications: {error}")
        return 1


def app_switcher_cli(port: Optional[int] = None) -> int:
    """Open the iOS App Switcher on an active MirrOS session."""
    target_port = port or 8080
    url = f"http://127.0.0.1:{target_port}/app-switcher"
    try:
        req = Request(url, data=b"{}", headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("status") == "ok":
                method = data.get("method", "gesture")
                print(f"[+] App Switcher (multitasking) triggered via {method} at http://127.0.0.1:{target_port}/.")
                return 0
            else:
                print(f"[!] Error from MirrOS: {data.get('message', 'unknown')}")
                return 1
    except Exception as error:
        print(f"[!] Could not reach MirrOS on port {target_port}: {error}")
        print("    Start MirrOS first (e.g. 'mirros') before sending shortcuts to the active session.")
        return 1


def launch_app_cli(bundle_id: str, port: Optional[int] = None) -> int:
    """Open an installed iPhone application via an active MirrOS session."""
    target_port = port or 8080
    url = f"http://127.0.0.1:{target_port}/apps/launch"
    payload = json.dumps({"bundle_id": bundle_id.strip()}).encode("utf-8")
    try:
        req = Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("status") == "ok":
                print(f"[+] Opened {data.get('bundle_id', bundle_id)} on iPhone.")
                return 0
            print(f"[!] Error from MirrOS: {data.get('message', 'unknown')}")
            return 1
    except Exception as error:
        print(f"[!] Could not launch app via MirrOS on port {target_port}: {error}")
        print("    Start MirrOS first (e.g. 'mirros') before launching apps on the active session.")
        return 1
