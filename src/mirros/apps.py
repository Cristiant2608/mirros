"""Gestión de aplicaciones y atajos multitarea para MirrOS."""

import asyncio
import json
from typing import Optional
from urllib.request import Request, urlopen


def list_apps_cli(udid: Optional[str] = None) -> int:
    """Lista aplicaciones de usuario en el iPhone desde el terminal."""
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.services.installation_proxy import InstallationProxyService
    from mirros.device import check_usbmuxd_socket, list_connected_devices

    if not check_usbmuxd_socket():
        print("[!] El servicio usbmuxd no está disponible.")
        return 1

    devices = list_connected_devices()
    if not devices:
        print("[!] No se detectó ningún iPhone conectado por USB.")
        return 1
    if udid and udid not in devices:
        print(f"[!] Dispositivo {udid} no encontrado. Disponibles: {', '.join(devices)}")
        return 1
    target = udid or devices[0]

    async def _fetch():
        lockdown = await create_using_usbmux(serial=target)
        async with InstallationProxyService(lockdown) as service:
            return await service.get_apps(application_type="User")

    try:
        print(f"[*] Conectando con iPhone ({target})...", flush=True)
        apps = asyncio.run(_fetch())
        if not apps:
            print("[+] No se encontraron aplicaciones de usuario.")
            return 0
        sorted_apps = sorted(
            apps.items(),
            key=lambda x: (x[1].get("CFBundleDisplayName") or x[1].get("CFBundleName") or x[0]).lower(),
        )
        print(f"[+] {len(sorted_apps)} aplicaciones encontradas:\n")
        for bundle_id, data in sorted_apps:
            name = data.get("CFBundleDisplayName") or data.get("CFBundleName") or bundle_id
            version = data.get("CFBundleShortVersionString") or data.get("CFBundleVersion") or ""
            v_str = f" (v{version})" if version else ""
            print(f"  • {name}{v_str}")
            print(f"    ID: {bundle_id}")
        return 0
    except Exception as error:
        print(f"[!] Error al consultar aplicaciones: {error}")
        return 1


def app_switcher_cli(port: Optional[int] = None) -> int:
    """Envía la orden de abrir el selector de apps a una sesión activa de MirrOS."""
    target_port = port or 8080
    url = f"http://127.0.0.1:{target_port}/app-switcher"
    try:
        req = Request(url, data=b"{}", headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("status") == "ok":
                method = data.get("method", "gesture")
                print(f"[+] Selector de aplicaciones (multitarea) activado vía {method} en http://127.0.0.1:{target_port}/.")
                return 0
            else:
                print(f"[!] Error desde MirrOS: {data.get('message', 'desconocido')}")
                return 1
    except Exception as error:
        print(f"[!] No se pudo comunicar con MirrOS en el puerto {target_port}: {error}")
        print("    Inicia primero MirrOS (ej. 'mirros') para enviar atajos a la sesión activa.")
        return 1
