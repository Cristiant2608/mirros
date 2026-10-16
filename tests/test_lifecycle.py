"""Regressions for startup failures, signals and isolated session resources."""
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

from mirros.runner import get_available_port, run_mirros
from mirros.processes import start_process, stop_process, stop_server


class StartupTests(unittest.TestCase):
    @unittest.skipIf(os.name == 'nt', 'POSIX process groups')
    def test_descendants_are_stopped_after_the_launcher_exits(self):
        child = "import socket,time; s=socket.socket(); s.bind(('127.0.0.1',0)); s.listen(); print(s.getsockname()[1],flush=True); time.sleep(60)"
        launcher = 'import subprocess,sys; subprocess.Popen([sys.executable,"-u","-c",sys.argv[1]])'
        process = start_process([sys.executable, '-c', launcher, child], stdout=subprocess.PIPE, text=True)
        try:
            port = int(process.stdout.readline())
            process.wait(timeout=5)
            stop_process(process)
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                with socket.socket() as connection:
                    if connection.connect_ex(('127.0.0.1', port)) != 0:
                        break
                time.sleep(.02)
            else:
                self.fail('Descendant server survived its launcher')
        finally:
            stop_process(process)
            process.stdout.close()

    def test_invalid_port_fails_before_device_discovery(self):
        for port in (0, -1, 65536):
            with patch('mirros.runner.list_connected_devices') as discover:
                self.assertEqual(run_mirros(port=port), 1)
                discover.assert_not_called()
            with self.assertRaises(ValueError):
                get_available_port(port)

    def test_occupied_port_never_prepares_device(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            with patch('mirros.runner.list_connected_devices', return_value=['test']), \
                 patch('mirros.runner.device_instructions'), \
                 patch('mirros.runner.prepare_device') as prepare:
                self.assertEqual(run_mirros(port=listener.getsockname()[1]), 1)
                prepare.assert_not_called()

    def test_failed_backend_returns_error_and_is_cleaned_up(self):
        server = Mock()
        with patch('mirros.runner.list_connected_devices', return_value=['test']), \
             patch('mirros.runner.device_instructions'), \
             patch('mirros.runner.prepare_device', return_value=True), \
             patch('mirros.runner.subprocess.Popen', return_value=server), \
             patch('mirros.runner.wait_for_server', return_value=False), \
             patch('mirros.runner.stop_server') as stop:
            self.assertEqual(run_mirros(), 1)
            stop.assert_called_once()
            self.assertIs(stop.call_args.args[0], server)

    def test_shutdown_requests_input_release_before_forcing_stop(self):
        process = Mock()
        process.poll.return_value = None
        response = Mock()
        response.__enter__ = Mock(return_value=Mock(status=200))
        response.__exit__ = Mock(return_value=False)
        with patch('mirros.processes.urlopen', return_value=response) as request, \
             patch('mirros.processes.stop_process') as stop:
            stop_server(process, 54321)
            self.assertEqual(request.call_args.args[0].full_url, 'http://127.0.0.1:54321/session/end')
            self.assertEqual(request.call_args.args[0].method, 'POST')
            process.wait.assert_called_once_with(timeout=7)
            stop.assert_called_once_with(process)

    @unittest.skipIf(os.name == 'nt', 'POSIX SIGTERM regression')
    def test_sigterm_reaps_backend_and_returns_signal_exit_status(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'backend.pid'
            code = '''
import sys
from pathlib import Path
from unittest.mock import patch
from mirros.runner import run_mirros
def ready(child, port):
    Path(sys.argv[1]).write_text(str(child.pid))
    return True
with patch('mirros.runner.list_connected_devices', return_value=['test']), patch('mirros.runner.device_instructions'), patch('mirros.runner.find_browser', return_value=None), patch('mirros.runner.prepare_device', return_value=True), patch('mirros.runner.wait_for_server', side_effect=ready), patch('mirros.runner.build_server_command', return_value=[sys.executable, '-c', 'import time; time.sleep(60)']):
    raise SystemExit(run_mirros())
'''
            process = subprocess.Popen([sys.executable, '-c', code, str(marker)],
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            backend_pid = None
            try:
                deadline = time.monotonic() + 10
                while not marker.exists() and time.monotonic() < deadline:
                    if process.poll() is not None:
                        self.fail(str(process.communicate()))
                    time.sleep(.02)
                self.assertTrue(marker.exists(), 'Backend never started')
                backend_pid = int(marker.read_text())
                process.send_signal(signal.SIGTERM)
                output, errors = process.communicate(timeout=15)
                self.assertEqual(process.returncode, 128 + signal.SIGTERM, output + errors)
                with self.assertRaises(ProcessLookupError):
                    os.kill(backend_pid, 0)
            finally:
                stop_process(process)
                if backend_pid:
                    try:
                        os.kill(backend_pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
