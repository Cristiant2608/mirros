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

from ios_scrcpy.device import list_connected_devices
from ios_scrcpy.runner import build_server_command, get_available_port, stop_process, wait_for_server


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
        with patch('ios_scrcpy.runner.urlopen', return_value=Response(b'<html>viewer</html>')):
            self.assertFalse(wait_for_server(process, 8080, timeout=0.1))

    def test_failed_preparation_stops_startup(self):
        from ios_scrcpy.runner import run_ios_scrcpy
        with patch('ios_scrcpy.runner.list_connected_devices', return_value=['test-device']), \
             patch('ios_scrcpy.runner.device_instructions'), \
             patch('ios_scrcpy.runner.prepare_device', return_value=False), \
             patch('ios_scrcpy.runner.subprocess.Popen') as spawn:
            self.assertEqual(run_ios_scrcpy(), 1)
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
        from ios_scrcpy.runner import run_ios_scrcpy
        with patch("ios_scrcpy.runner.list_connected_devices", return_value=[]), \
             patch("ios_scrcpy.runner.device_instructions"), \
             patch("ios_scrcpy.runner.time.sleep", side_effect=KeyboardInterrupt), \
             patch("ios_scrcpy.runner.subprocess.Popen") as spawn:
            self.assertEqual(run_ios_scrcpy(), 0)
            spawn.assert_not_called()

    def test_multiple_devices_require_selection(self):
        from ios_scrcpy.runner import run_ios_scrcpy
        with patch("ios_scrcpy.runner.list_connected_devices", return_value=["one", "two"]), \
             patch("ios_scrcpy.runner.device_instructions"), \
             patch("ios_scrcpy.runner.subprocess.Popen") as spawn:
            self.assertEqual(run_ios_scrcpy(), 1)
            spawn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
