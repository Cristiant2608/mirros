"""Módulo de ejecución y gestión de procesos de ios-scrcpy."""

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from typing import Optional

from ios_scrcpy.device import check_usbmuxd_socket, is_usbmuxd_installed, list_connected_devices


def find_pymobiledevice3() -> Optional[str]:
    """Localiza el binario de pymobiledevice3, priorizando el entorno virtual."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    venv_bin = os.path.join(base_dir, ".venv", "bin", "pymobiledevice3")
    if os.path.isfile(venv_bin) and os.access(venv_bin, os.X_OK):
        return venv_bin
    system_bin = shutil.which("pymobiledevice3")
    if system_bin:
        return system_bin
    return None


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Comprueba si un puerto TCP local está ocupado."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def wait_for_server(port: int, host: str = "127.0.0.1", timeout: float = 15.0) -> bool:
    """Espera a que el servidor web local esté respondiendo peticiones."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if is_port_in_use(port, host):
            return True
        time.sleep(0.3)
    return False


def get_available_port(start_port: int = 8080) -> int:
    """Encuentra un puerto libre comenzando por start_port."""
    port = start_port
    while is_port_in_use(port):
        port += 1
    return port


def find_browser() -> Optional[str]:
    """Detecta un navegador compatible con el modo app independiente."""
    candidates = [
        "chromium",
        "google-chrome-stable",
        "google-chrome",
        "brave-browser",
        "microsoft-edge-stable",
        "zen-browser",
        "firefox",
    ]
    for c in candidates:
        path = shutil.which(c)
        if path:
            return path
    return None


def run_ios_scrcpy(
    port: Optional[int] = None,
    no_audio: bool = False,
    userspace: bool = True,
    udid: Optional[str] = None,
    browser_bin: Optional[str] = None,
) -> int:
    """Lanza el servidor de streaming y la ventana de control interactivo."""
    pmd3 = find_pymobiledevice3()
    if not pmd3:
        print("[!] Error: No se encontró 'pymobiledevice3'. Por favor ejecuta el script de instalación.")
        return 1

    # Comprobación de usbmuxd
    if not check_usbmuxd_socket():
        print("────────────────────────────────────────────────────────────────────────")
        print("[!] Aviso: El servicio 'usbmuxd' no parece estar activo en /var/run/usbmuxd.")
        if not is_usbmuxd_installed():
            print("    Para instalarlo en tu distribución Arch / CachyOS ejecuta:")
            print("    👉 sudo pacman -S --needed usbmuxd")
            print("    👉 sudo systemctl enable --now usbmuxd")
        else:
            print("    El paquete está instalado. Inicia el servicio con:")
            print("    👉 sudo systemctl start usbmuxd")
        print("────────────────────────────────────────────────────────────────────────\n")

    # Detección de dispositivos
    print("[*] Buscando dispositivos iOS conectados por USB...")
    devices = list_connected_devices()
    if not devices:
        print("[*] No se detectó ningún iPhone en este momento.")
        print("    1. Conecta tu iPhone a este PC con cable USB.")
        print("    2. Desbloquea la pantalla.")
        print("    3. Si aparece una ventana emergente en el iPhone, pulsa 'Confiar en este ordenador'.")
        print("    4. Asegúrate de tener activado el 'Modo Desarrollador' (Ajustes > Privacidad y seguridad).\n")
        print("[*] Esperando a que conectes el dispositivo (Ctrl+C para cancelar)...")
        while not devices:
            time.sleep(1.5)
            devices = list_connected_devices()
            if not check_usbmuxd_socket() and not devices:
                # Si no hay socket, no podremos esperar activamente
                break

    target_udid = udid or (devices[0] if devices else None)
    if target_udid:
        print(f"[+] Dispositivo detectado: {target_udid}")

    target_port = port or get_available_port(8080)
    server_url = f"http://127.0.0.1:{target_port}/"

    # Construir comando de pymobiledevice3
    cmd = [
        pmd3,
        "developer",
        "core-device",
        "display",
        "serve-web",
        "--bind",
        "127.0.0.1",
        "--http-port",
        str(target_port),
    ]

    if userspace:
        cmd.append("--userspace")

    if no_audio:
        cmd.append("--no-audio")

    env = os.environ.copy()
    if target_udid:
        env["PYMOBILEDEVICE3_UDID"] = target_udid

    print(f"[*] Iniciando servidor de pantalla y control en {server_url}...")
    log_path = "/tmp/ios-scrcpy-backend.log"
    backend_log = open(log_path, "w")
    server_process = subprocess.Popen(
        cmd,
        stdout=backend_log,
        stderr=subprocess.STDOUT,
        env=env,
    )

    def cleanup(signum=None, frame=None):
        print("\n[*] Cerrando ios-scrcpy y deteniendo servicios...")
        if server_process and server_process.poll() is None:
            server_process.terminate()
            try:
                server_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server_process.kill()
        try:
            backend_log.close()
        except Exception:
            pass
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    print("[*] Esperando a que el backend esté listo...")
    ready = wait_for_server(target_port, timeout=12.0)

    # Comprobar si el proceso del servidor se cerró antes de tiempo
    if server_process.poll() is not None or not ready:
        try:
            with open(log_path, "r") as f:
                log_content = f.read()
                print(f"[!] El servidor de streaming falló al iniciar. Registro:\n{log_content[-1000:]}")
        except Exception:
            print("[!] El servidor de streaming falló al iniciar.")
        cleanup()
        return 1

    # Lanzar la ventana de interfaz
    browser = browser_bin or find_browser()
    browser_proc = None

    browser_name = os.path.basename(browser) if browser else ""
    if browser and ("chromium" in browser_name or "chrome" in browser_name or "brave" in browser_name):
        print(f"[+] Abriendo ventana de aplicación con {browser_name}...")
        user_data = f"/tmp/ios-scrcpy-{os.getuid()}"
        browser_cmd = [
            browser,
            f"--app={server_url}",
            f"--user-data-dir={user_data}",
            "--class=ios-scrcpy",
            "--window-name=iOS-Scrcpy",
            "--window-size=440,940",
            "--enable-features=PlatformHEVCDecoderSupport",
            "--ignore-gpu-blocklist",
            "--no-first-run",
            "--no-default-browser-check",
        ]
        browser_proc = subprocess.Popen(browser_cmd)
    elif browser:
        print(f"[+] Abriendo {server_url} en {os.path.basename(browser)}...")
        browser_proc = subprocess.Popen([browser, server_url])
    else:
        print(f"[+] Servidor activo. Abre tu navegador en: {server_url}")

    print("\n" + "=" * 60)
    print("  iOS-Scrcpy está ejecutándose.")
    print("  - Clic primario: Toque en pantalla (Tap)")
    print("  - Arrastrar: Gesto táctil (Swipe / Scroll)")
    print("  - Clic derecho: Botón Inicio (Home)")
    print("  - Teclas: Envío de pulsaciones de teclado")
    print("  - Ctrl+H: Inicio | Ctrl+L: Bloqueo | Ctrl+P: Captura")
    print("  Presiona Ctrl+C en esta terminal para detener.")
    print("=" * 60 + "\n")

    # Mantener el servidor activo hasta que el usuario pulse Ctrl+C o el servidor falle
    try:
        while True:
            if server_process.poll() is not None:
                print("[!] El servidor de transmisión se detuvo.")
                try:
                    with open(log_path, "r") as f:
                        print(f"[!] Registro del servidor:\n{f.read()[-1000:]}")
                except Exception:
                    pass
                break
            time.sleep(1.0)
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()

    return 0
