"""Arranque nativo en Windows y Linux y gestión del servidor de pantalla."""

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from typing import Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from mirros.processes import TerminationRequested, shutdown_signals, start_process, stop_process, stop_server

from mirros.device import check_usbmuxd_socket, list_connected_devices


def get_available_port(start_port: int = 8080) -> int:
    if not 1 <= start_port <= 65535:
        raise ValueError("El puerto debe estar entre 1 y 65535.")
    for port in range(start_port, 65536):
        try:
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", port))
            return port
        except OSError:
            continue
    raise OSError("No hay puertos locales disponibles.")


def find_browser() -> Optional[str]:
    for name in ("msedge", "chrome", "chromium", "google-chrome-stable", "google-chrome", "brave-browser", "microsoft-edge-stable"):
        if path := shutil.which(name):
            return path
    if os.name == "nt":
        for root in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
            if not os.environ.get(root):
                continue
            for relative in ("Microsoft/Edge/Application/msedge.exe", "Google/Chrome/Application/chrome.exe", "BraveSoftware/Brave-Browser/Application/brave.exe"):
                path = Path(os.environ[root]) / relative
                if path.is_file():
                    return str(path)
    return None


def build_server_command(port: int, no_audio: bool, userspace: bool, udid: str) -> list[str]:
    cmd = [sys.executable, "-m", "mirros.backend", "developer", "core-device", "display", "serve-web",
           "--bind", "127.0.0.1", "--http-port", str(port)]
    if userspace:
        cmd.append("--userspace")
    else:
        cmd.extend(["--tunnel", udid])
    if no_audio:
        cmd.append("--no-audio")
    return cmd


def wait_for_server(process: subprocess.Popen, port: int, timeout: float = 90) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return False
        try:
            with urlopen(f"http://127.0.0.1:{port}/codec", timeout=8) as response:
                payload = json.load(response)
                if response.status == 200 and payload.get("codec") and payload.get("description"):
                    return process.poll() is None
        except (URLError, OSError, ValueError):
            pass
        time.sleep(0.3)
    return False


def prepare_device(udid: str, userspace: bool, log_path: Path) -> bool:
    """Monta DDI antes de abrir RSD: sin DDI el HTML funciona, pero no el video/HID."""
    command = [sys.executable, "-m", "pymobiledevice3", "mounter", "auto-mount"]
    if userspace:
        command.append("--userspace")
    else:
        command.extend(["--tunnel", udid])
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1", "PYMOBILEDEVICE3_UDID": udid}
    print("[*] Preparando servicios del iPhone (la primera vez descarga la imagen de desarrollo)...", flush=True)
    process = None
    try:
        with log_path.open("w", encoding="utf-8") as log:
            process = start_process(command, stdout=log, stderr=subprocess.STDOUT, env=env)
            try:
                result = process.wait(timeout=600)
            except subprocess.TimeoutExpired:
                print("[!] La preparación del iPhone superó 10 minutos.", flush=True)
                return False
        if result != 0:
            print("[!] No se pudieron habilitar los servicios de pantalla. Revisa Modo Desarrollador y conexión.")
            print(log_path.read_text(encoding="utf-8", errors="replace")[-6000:])
            return False
        return True
    finally:
        stop_process(process)


def device_instructions() -> None:
    if not check_usbmuxd_socket():
        if os.name == "nt":
            print("[!] Falta Apple Mobile Device Service o está detenido.")
            print("    Instala iTunes de Apple o Dispositivos Apple y comprueba el servicio USB.")
        else:
            print("[!] Inicia usbmuxd (en Arch: sudo systemctl enable --now usbmuxd).")
    print("    Conecta el iPhone por USB, desbloquéalo y pulsa 'Confiar'.")
    print("    Activa Modo Desarrollador en Ajustes > Privacidad y seguridad.")


@shutdown_signals
def run_mirros(port: Optional[int] = None, no_audio: bool = True,
                   userspace: bool = True, udid: Optional[str] = None,
                   browser_bin: Optional[str] = None, diagnose: bool = False,
                   display_mode: str = "dual") -> int:
    if port is not None and not 1 <= port <= 65535:
        print("[!] El puerto debe estar entre 1 y 65535.")
        return 1
    browser = browser_bin or find_browser()
    if diagnose:
        from importlib.metadata import version
        print(f"Python: {sys.version.split()[0]} ({sys.platform})")
        print(f"pymobiledevice3: {version('pymobiledevice3')}")
        print(f"Navegador: {'disponible' if browser and shutil.which(browser) else 'no encontrado'}")
        print(f"Servicio USB: {'disponible' if check_usbmuxd_socket() else 'no disponible'}")
        try:
            devices = list_connected_devices()
            print(f"Dispositivos USB: {len(devices)}")
        except Exception as error:
            print(f"Detección USB: no disponible ({type(error).__name__})")
            return 1
        return 0

    if browser_bin:
        browser = shutil.which(browser_bin)
        if not browser:
            print(f"[!] Navegador no encontrado: {browser_bin}")
            return 1
    server = None
    target_port = None
    log_path = Path(tempfile.mkdtemp(prefix="mirros-")) / "backend.log"
    try:
        print("[*] Buscando iPhone por USB...", flush=True)
        device_instructions()
        print("[*] Esperando dispositivo (Ctrl+C para cancelar)...", flush=True)
        last_error = None
        while True:
            try:
                devices = list_connected_devices()
                last_error = None
            except Exception as error:
                devices = []
                message = str(error) or type(error).__name__
                if message != last_error:
                    print(f"[!] USB: {message}", flush=True)
                    last_error = message
            if udid and udid in devices:
                target = udid
                break
            if not udid and len(devices) == 1:
                target = devices[0]
                break
            if not udid and len(devices) > 1:
                print("[!] Hay varios dispositivos. Usa --udid con uno de: " + ", ".join(devices))
                return 1
            time.sleep(1.5)

        target_port = port if port is not None else get_available_port()
        if port is not None and get_available_port(port) != port:
            print(f"[!] El puerto {port} está ocupado. Elige otro con --port.")
            return 1
        url = f"http://127.0.0.1:{target_port}/"
        print(f"[+] iPhone detectado: {target}", flush=True)
        preparation_log = log_path.with_name(log_path.stem + "-prepare.log")
        if not prepare_device(target, userspace, preparation_log):
            return 1
        print(f"[*] Iniciando pantalla en {url} (registro: {log_path})", flush=True)
        with log_path.open("w", encoding="utf-8") as log:
            env = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1",
                   "PYMOBILEDEVICE3_UDID": target}
            server = start_process(build_server_command(target_port, no_audio, userspace, target),
                                      stdout=log, stderr=subprocess.STDOUT, env=env)
            if not wait_for_server(server, target_port):
                print("[!] El servidor no pudo iniciar. Revisa confianza, Modo Desarrollador y versión de iOS.")
                print(log_path.read_text(encoding="utf-8", errors="replace")[-6000:])
                return 1
            if display_mode == "aod":
                try:
                    req = Request(f"http://127.0.0.1:{target_port}/display-mode",
                                  data=json.dumps({"mode": "aod"}).encode("utf-8"),
                                  headers={"Content-Type": "application/json"})
                    with urlopen(req, timeout=3):
                        pass
                except Exception:
                    pass
            if browser:
                # Perfil propio: Edge no reutiliza una instancia ajena.
                with tempfile.TemporaryDirectory(prefix="mirros-browser-", ignore_cleanup_errors=True) as profile:
                    browser_command = [
                        browser, f"--app={url}", f"--user-data-dir={profile}",
                        "--window-size=480,960", "--no-first-run", "--no-default-browser-check",
                        "--enable-features=PlatformHEVCDecoderSupport",
                    ]
                    browser_process = start_process(browser_command)
                    try:
                        return monitor(server, browser_process, log_path)
                    finally:
                        stop_process(browser_process)
            print(f"[+] Abre {url} en Edge o Chrome.", flush=True)
            return monitor(server, None, log_path)
    except TerminationRequested as error:
        print("\n[*] Cerrando MirrOS por señal.")
        return 128 + error.signum
    except KeyboardInterrupt:
        print("\n[*] Cerrando MirrOS.")
        return 0
    except (OSError, RuntimeError) as error:
        print(f"[!] {error}")
        return 1
    finally:
        stop_server(server, target_port)


def monitor(server: subprocess.Popen, browser: Optional[subprocess.Popen], log_path: Path) -> int:
    print("[+] MirrOS activo. Cierra la ventana o pulsa Ctrl+C para detener.", flush=True)
    while server.poll() is None:
        if browser is not None and browser.poll() is not None:
            return 0
        time.sleep(0.5)
    print("[!] El servidor se detuvo.")
    print(log_path.read_text(encoding="utf-8", errors="replace")[-6000:])
    return server.returncode or 1
