"""Installer tests use a fake interpreter; no packages or user files are changed."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


@unittest.skipIf(os.name == 'nt', 'Bash installer')
class SetupTests(unittest.TestCase):
    def test_existing_environment_is_repaired_on_every_run(self):
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
            env = {**os.environ, 'HOME': str(root / 'home'), 'SETUP_LOG': str(root / 'calls')}
            for _ in range(2):
                result = subprocess.run(['bash', str(root / 'setup.sh')], env=env,
                                        capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
            calls = (root / 'calls').read_text()
            self.assertEqual(calls.count('-m pip install -e'), 2)
            self.assertEqual(calls.count('-m pip check'), 2)
            self.assertEqual((root / 'home/.local/bin/mirros').resolve(), root / 'bin/mirros')
            self.assertEqual((root / 'home/.local/bin/ios-scrcpy').resolve(), root / 'bin/mirros')
