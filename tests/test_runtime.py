"""Pruebas de transporte, disponibilidad HTTP y cierre de procesos sin iPhone."""

import asyncio
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import socket
import subprocess
import sys
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from mirros.device import list_connected_devices
from mirros.runner import build_server_command, get_available_port, stop_process, wait_for_server


class RuntimeTests(unittest.TestCase):
    def test_discovery_uses_async_backend_and_filters_wifi(self):
        devices = [SimpleNamespace(serial="usb-device", connection_type="USB"),
                   SimpleNamespace(serial="wifi-device", connection_type="Network")]
        with patch("pymobiledevice3.usbmux.list_devices", new=AsyncMock(return_value=devices)) as discover:
            self.assertEqual(list_connected_devices(), ["usb-device"])
            discover.assert_awaited_once()

    def test_occupied_port_is_skipped(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            if port == 65535:
                self.skipTest("Último puerto asignado por Windows")
            self.assertGreater(get_available_port(port), port)

    def test_dead_backend_does_not_accept_an_unrelated_server(self):
        process = SimpleNamespace(poll=lambda: 1)
        self.assertFalse(wait_for_server(process, 8080, timeout=1))

    def test_readiness_requires_successful_http_response(self):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({'codec': 'hev1.test', 'description': 'AAAA'}).encode())

            def log_message(self, *args):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                process = SimpleNamespace(poll=lambda: None)
                self.assertTrue(wait_for_server(process, server.server_port, timeout=2))
            finally:
                server.shutdown()
                thread.join()

    def test_html_success_is_not_video_readiness(self):
        from io import BytesIO
        class Response(BytesIO):
            status = 200

        process = SimpleNamespace(poll=lambda: None)
        with patch('mirros.runner.urlopen', return_value=Response(b'<html>viewer</html>')):
            self.assertFalse(wait_for_server(process, 8080, timeout=0.1))

    def test_failed_preparation_stops_startup(self):
        from mirros.runner import run_mirros
        with patch('mirros.runner.list_connected_devices', return_value=['test-device']), \
             patch('mirros.runner.device_instructions'), \
             patch('mirros.runner.prepare_device', return_value=False), \
             patch('mirros.runner.subprocess.Popen') as spawn:
            self.assertEqual(run_mirros(), 1)
            spawn.assert_not_called()

    def test_real_child_is_stopped_and_reaped(self):
        process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
        try:
            stop_process(process)
            self.assertIsNotNone(process.poll())
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()

    @unittest.skipUnless(os.name == 'nt', 'Regresión del lanzador venv en Windows')
    def test_windows_stop_includes_grandchild(self):
        import psutil
        code = "import subprocess,sys,time; child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)']); print(child.pid,flush=True); time.sleep(30)"
        process = subprocess.Popen([sys.executable, '-c', code], stdout=subprocess.PIPE, text=True)
        child_pid = int(process.stdout.readline().strip())
        try:
            stop_process(process)
            self.assertFalse(psutil.pid_exists(child_pid))
        finally:
            process.stdout.close()
            if psutil.pid_exists(child_pid):
                psutil.Process(child_pid).kill()
            if process.poll() is None:
                process.kill()
                process.wait()

    def test_external_tunnel_is_explicit(self):
        command = build_server_command(8080, True, False, "test-device")
        self.assertEqual(command[command.index("--tunnel") + 1], "test-device")
        self.assertNotIn("--userspace", command)

    def test_missing_device_never_starts_backend(self):
        from mirros.runner import run_mirros
        with patch("mirros.runner.list_connected_devices", return_value=[]), \
             patch("mirros.runner.device_instructions"), \
             patch("mirros.runner.time.sleep", side_effect=KeyboardInterrupt), \
             patch("mirros.runner.subprocess.Popen") as spawn:
            self.assertEqual(run_mirros(), 0)
            spawn.assert_not_called()

    def test_multiple_devices_require_selection(self):
        from mirros.runner import run_mirros
        with patch("mirros.runner.list_connected_devices", return_value=["one", "two"]), \
             patch("mirros.runner.device_instructions"), \
             patch("mirros.runner.subprocess.Popen") as spawn:
            self.assertEqual(run_mirros(), 1)
            spawn.assert_not_called()

    def test_inspect_device_reveals_developer_mode_and_checks_ios_version(self):
        from mirros.device import inspect_device
        lockdown = SimpleNamespace(
            paired=True,
            all_values={"DeviceName": "iPhone de Prueba"},
            product_version="17.2",
            has_developer_mode=True,
            get_developer_mode_status=AsyncMock(return_value=False),
        )
        ctx = AsyncMock()
        ctx.__aenter__.return_value = lockdown
        amfi_instance = SimpleNamespace(reveal_developer_mode_option_in_ui=AsyncMock())
        with patch("pymobiledevice3.lockdown.create_using_usbmux", new=AsyncMock(return_value=ctx)), \
             patch("pymobiledevice3.services.amfi.AmfiService", return_value=amfi_instance) as amfi_cls:
            info = asyncio.run(inspect_device("test-udid", reveal_developer_mode=True))
        self.assertEqual(info["name"], "iPhone de Prueba")
        self.assertEqual(info["version"], "17.2")
        self.assertTrue(info["paired"])
        self.assertFalse(info["developer_mode"])
        self.assertTrue(info["developer_mode_revealed"])
        self.assertFalse(info["userspace_supported"])
        amfi_cls.assert_called_once_with(lockdown)
        amfi_instance.reveal_developer_mode_option_in_ui.assert_awaited_once()

    def test_inspect_device_reports_unpaired_when_trust_is_pending(self):
        from mirros.device import inspect_device
        lockdown = SimpleNamespace(
            paired=False,
            all_values={},
            product_version="18.1",
            pair=AsyncMock(side_effect=RuntimeError("dialog pending")),
        )
        ctx = AsyncMock()
        ctx.__aenter__.return_value = lockdown
        with patch("pymobiledevice3.lockdown.create_using_usbmux", new=AsyncMock(return_value=ctx)):
            info = asyncio.run(inspect_device("unpaired-udid"))
        self.assertFalse(info["paired"])
        self.assertEqual(info["version"], "18.1")

    def test_prepare_device_stops_early_when_developer_mode_is_disabled(self):
        from pathlib import Path
        import tempfile
        from mirros.runner import prepare_device
        info = {
            "udid": "test-udid",
            "paired": True,
            "developer_mode": False,
            "developer_mode_revealed": True,
            "userspace_supported": True,
        }
        with tempfile.TemporaryDirectory() as tmp, \
             patch("mirros.device.inspect_device", new=AsyncMock(return_value=info)), \
             patch("mirros.runner.start_process") as spawn, \
             patch("builtins.print"):
            self.assertFalse(prepare_device("test-udid", True, Path(tmp) / "prep.log"))
            spawn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
