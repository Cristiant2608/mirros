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
