# Runtime USB autónomo para Windows/Linux.
from pathlib import Path
from importlib.util import find_spec
import sys
from PyInstaller.utils.hooks import collect_all, copy_metadata

project = Path(SPECPATH).parent
datas = [(str(project / 'src/mirros/assets/hevc_dimensions.js'), 'mirros/assets')]
binaries, hiddenimports = [], []
if sys.platform == 'win32':
    # Imported by the upstream tunnel module, even when using --userspace.
    wintun = Path(find_spec('pytun_pmd3').origin).parent / 'wintun'
    binaries += [(str(wintun / 'bin/amd64/wintun.dll'), 'pytun_pmd3/wintun/bin/amd64')]
    datas += [(str(wintun / 'LICENSE.txt'), 'pytun_pmd3/wintun')]
datas += copy_metadata('pymobiledevice3', recursive=True)
datas += copy_metadata('mirros')
datas += copy_metadata('pykdebugparser')
for package in ('pymobiledevice3', 'developer_disk_image', 'pytcp', 'pykdebugparser'):
    data, binary, imports = collect_all(package)
    datas += data
    binaries += binary
    hiddenimports += imports

# The interactive research shell is not exposed by the Mirros worker.
a = Analysis([str(project / 'desktop/worker.py')], pathex=[str(project / 'src')],
    binaries=binaries, datas=datas, hiddenimports=hiddenimports, hookspath=[],
    hooksconfig={}, runtime_hooks=[], excludes=['IPython', 'jedi'], noarchive=False, optimize=0)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='mirros-backend',
    debug=False, bootloader_ignore_signals=False, strip=False, upx=False, console=True)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='mirros-backend')
