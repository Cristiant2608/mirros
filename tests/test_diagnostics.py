import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from mirros.diagnostics import collect_report, write_report


class DiagnosticTests(unittest.TestCase):
    def test_default_report_never_queries_usb_or_exports_environment_and_paths(self):
        with patch('mirros.device.list_connected_devices') as discover, \
             patch.dict(os.environ, {'WAYLAND_DISPLAY':'private-display', 'SECRET':'secret-fixture'}), \
             patch('mirros.diagnostics.shutil.which', return_value='/home/private-user/tool'):
            report = collect_report()
        discover.assert_not_called()
        exported = json.dumps(report)
        for private in ('private-display', 'secret-fixture', 'private-user'):
            self.assertNotIn(private, exported)
        self.assertIs(report['desktop']['wayland'], True)
        self.assertEqual(report['usb'], {'status':'not_probed'})

    def test_usb_exports_only_count_and_discards_exception_details(self):
        with patch('mirros.device.list_connected_devices', return_value=['private-serial']):
            report = collect_report(True)
        self.assertEqual(report['usb'], {'status':'ok', 'device_count':1})
        self.assertNotIn('private-serial', json.dumps(report))
        with patch('mirros.device.list_connected_devices', side_effect=RuntimeError('/home/private-serial')):
            report = collect_report(True)
        self.assertEqual(report['usb'], {'status':'unavailable'})
        self.assertNotIn('private-serial', json.dumps(report))

    def test_output_is_private_and_cannot_replace_an_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'report.json'
            write_report({'schema_version':1}, path)
            self.assertEqual(json.loads(path.read_text()), {'schema_version':1})
            if os.name != 'nt':
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                write_report({'replacement':True}, path)
            self.assertEqual(json.loads(path.read_text()), {'schema_version':1})

    def test_recent_errors_allowlist_and_bound_history(self):
        from mirros.diagnostics import clear_diagnostic_errors, record_diagnostic_error
        clear_diagnostic_errors()
        self.addCleanup(clear_diagnostic_errors)
        record_diagnostic_error('/home/private-user/secret-udid')
        for _ in range(25):
            record_diagnostic_error('transport_closed')
        report = collect_report()
        self.assertEqual(len(report['recent_errors']), 20)
        self.assertTrue(all(item['code'] == 'transport_closed' for item in report['recent_errors']))
        self.assertNotIn('private-user', json.dumps(report))


class LegacyDiagnosticTests(unittest.TestCase):
    def run_diagnostic(self, **discovery):
        import contextlib
        import io
        from mirros.runner import run_mirros
        output = io.StringIO()
        with patch('mirros.runner.find_browser', return_value='/home/private-user/chromium'), \
             patch('mirros.runner.shutil.which', return_value='/home/private-user/chromium'), \
             patch('mirros.runner.check_usbmuxd_socket', return_value=True), \
             patch('mirros.runner.list_connected_devices', **discovery), \
             contextlib.redirect_stdout(output):
            code = run_mirros(diagnose=True)
        return code, output.getvalue()

    def test_legacy_diagnose_reports_count_without_serial_or_browser_path(self):
        code, text = self.run_diagnostic(return_value=['private-serial'])
        self.assertEqual(code, 0)
        self.assertIn('Dispositivos USB: 1', text)
        self.assertNotIn('private-serial', text)
        self.assertNotIn('private-user', text)

    def test_legacy_diagnose_discards_sensitive_exception_message(self):
        code, text = self.run_diagnostic(side_effect=RuntimeError('private-serial /home/private-user'))
        self.assertEqual(code, 1)
        self.assertIn('RuntimeError', text)
        self.assertNotIn('private-serial', text)
        self.assertNotIn('private-user', text)
