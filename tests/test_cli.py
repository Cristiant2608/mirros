"""Pruebas unitarias para la interfaz de línea de comandos (CLI) de MirrOS."""

import sys
import unittest
from unittest.mock import patch

from mirros.cli import main
from mirros.runner import run_mirros


class CliTests(unittest.TestCase):
    def test_cli_passes_software_and_quality_to_runner(self):
        with patch.object(sys, "argv", ["mirros", "--force-software", "--video-quality", "economy"]), \
             patch("mirros.cli.run_mirros", return_value=0) as mock_runner, \
             patch("sys.exit") as mock_exit:
            main()
            mock_runner.assert_called_once()
            self.assertEqual(mock_runner.call_args.kwargs["force_software"], True)
            self.assertEqual(mock_runner.call_args.kwargs["video_quality"], "economy")
            mock_exit.assert_called_once_with(0)

    def test_cli_default_video_arguments(self):
        with patch.object(sys, "argv", ["mirros"]), \
             patch("mirros.cli.run_mirros", return_value=0) as mock_runner, \
             patch("sys.exit") as mock_exit:
            main()
            mock_runner.assert_called_once()
            self.assertEqual(mock_runner.call_args.kwargs["force_software"], False)
            self.assertIsNone(mock_runner.call_args.kwargs["video_quality"])
            mock_exit.assert_called_once_with(0)

    def test_cli_rejects_invalid_video_quality(self):
        with patch.object(sys, "argv", ["mirros", "--video-quality", "ultra_hd"]), \
             patch("sys.stderr"):
            with self.assertRaises(SystemExit) as error:
                main()
            self.assertNotEqual(error.exception.code, 0)

    def test_cli_audio_toggle(self):
        with patch.object(sys, "argv", ["mirros", "--audio"]), \
             patch("mirros.cli.run_mirros", return_value=0) as mock_runner, \
             patch("sys.exit"):
            main()
            self.assertFalse(mock_runner.call_args.kwargs["no_audio"])

        with patch.object(sys, "argv", ["mirros", "--no-audio"]), \
             patch("mirros.cli.run_mirros", return_value=0) as mock_runner, \
             patch("sys.exit"):
            main()
            self.assertTrue(mock_runner.call_args.kwargs["no_audio"])

    def test_cli_rejects_out_of_range_port(self):
        for port in ("0", "65536", "-5"):
            with patch.object(sys, "argv", ["mirros", "-p", port]), \
                 patch("sys.stderr"):
                with self.assertRaises(SystemExit):
                    main()

    def test_cli_list_apps_dispatch(self):
        with patch.object(sys, "argv", ["mirros", "--list-apps"]), \
             patch("mirros.apps.list_apps_cli", return_value=0) as mock_apps, \
             patch("sys.exit") as mock_exit:
            main()
            mock_apps.assert_called_once_with(udid=None)
            mock_exit.assert_called_once_with(0)

    def test_cli_app_switcher_dispatch(self):
        with patch.object(sys, "argv", ["mirros", "--app-switcher", "-p", "9090"]), \
             patch("mirros.apps.app_switcher_cli", return_value=0) as mock_switcher, \
             patch("sys.exit") as mock_exit:
            main()
            mock_switcher.assert_called_once_with(port=9090)
            mock_exit.assert_called_once_with(0)


class RunnerUrlTests(unittest.TestCase):
    def test_url_with_software_and_quality(self):
        captured_url = None

        def fake_start_process(cmd, **kwargs):
            return None

        # Check that URL generated inside run_mirros includes query params
        with patch("mirros.runner.list_connected_devices", return_value=["test-device"]), \
             patch("mirros.runner.device_instructions"), \
             patch("mirros.runner.prepare_device", return_value=True), \
             patch("mirros.runner.get_available_port", return_value=8080), \
             patch("mirros.runner.wait_for_server", return_value=False), \
             patch("mirros.runner.start_process", side_effect=fake_start_process), \
             patch("mirros.runner.stop_server"), \
             patch("builtins.print") as mock_print:
            code = run_mirros(port=8080, force_software=True, video_quality="economy")
            self.assertEqual(code, 1)
            # Find the print statement containing url
            print_calls = [c.args[0] for c in mock_print.call_args_list if c.args]
            url_line = next((s for s in print_calls if "http://127.0.0.1:8080/" in s), None)
            self.assertIsNotNone(url_line)
            self.assertIn("software=1", url_line)
            self.assertIn("quality=economy", url_line)


if __name__ == "__main__":
    unittest.main()
