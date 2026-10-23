"""Installer tests use a fake interpreter; no packages or user files are changed."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


@unittest.skipIf(os.name == 'nt', 'Bash installer')
class SetupTests(unittest.TestCase):
    def test_existing_environment_is_repaired_with_pip_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copy(Path(__file__).parents[1] / 'setup.sh', root / 'setup.sh')
            (root / 'bin').mkdir()
            (root / 'bin/mirros').write_text('#!/bin/sh\nexit 0\n')
            venv = root / '.venv/bin'
            venv.mkdir(parents=True)
            python = venv / 'python'
            python.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$SETUP_LOG"\nexit 0\n')
            python.chmod(0o755)
            filtered_path = ':'.join(
                p for p in os.environ.get('PATH', '').split(':')
                if not os.path.exists(os.path.join(p, 'uv'))
            )
            env = {**os.environ, 'HOME': str(root / 'home'), 'SETUP_LOG': str(root / 'calls'), 'PATH': filtered_path}
            for _ in range(2):
                result = subprocess.run(['bash', str(root / 'setup.sh')], env=env,
                                        capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
            calls = (root / 'calls').read_text()
            self.assertEqual(calls.count('-m pip install -e'), 2)
            self.assertEqual(calls.count('-m pip check'), 2)
            self.assertEqual((root / 'home/.local/bin/mirros').resolve(), root / 'bin/mirros')
            self.assertEqual((root / 'home/.local/bin/ios-scrcpy').resolve(), root / 'bin/mirros')
            desktop_entry = root / 'home/.local/share/applications/mirros.desktop'
            self.assertTrue(desktop_entry.is_file())
            self.assertIn('Name=MirrOS', desktop_entry.read_text())

    def test_uv_environment_is_used_when_available(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copy(Path(__file__).parents[1] / 'setup.sh', root / 'setup.sh')
            (root / 'bin').mkdir()
            (root / 'bin/mirros').write_text('#!/bin/sh\nexit 0\n')
            (root / 'fake-tools').mkdir()
            fake_uv = root / 'fake-tools/uv'
            fake_uv.write_text('#!/bin/sh\nprintf "uv %s\\n" "$*" >> "$SETUP_LOG"\nexit 0\n')
            fake_uv.chmod(0o755)
            venv = root / '.venv/bin'
            venv.mkdir(parents=True)
            python = venv / 'python'
            python.write_text('#!/bin/sh\nexit 0\n')
            python.chmod(0o755)
            env = {
                **os.environ,
                'HOME': str(root / 'home'),
                'SETUP_LOG': str(root / 'calls'),
                'PATH': f"{root / 'fake-tools'}:{os.environ.get('PATH', '')}"
            }
            result = subprocess.run(['bash', str(root / 'setup.sh')], env=env,
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = (root / 'calls').read_text()
            self.assertIn('uv pip install -e', calls)
            self.assertIn('uv pip check', calls)
            self.assertEqual((root / 'home/.local/bin/mirros').resolve(), root / 'bin/mirros')
            self.assertEqual((root / 'home/.local/bin/ios-scrcpy').resolve(), root / 'bin/mirros')
            desktop_entry = root / 'home/.local/share/applications/mirros.desktop'
            self.assertTrue(desktop_entry.is_file())
            self.assertIn('Name=MirrOS', desktop_entry.read_text())
