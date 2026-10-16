#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PYTHON_BIN="${PYTHON_BIN:-$PWD/.venv/bin/python}"
if [[ ! -x "$PYTHON_BIN" ]]; then
    echo 'Ejecuta ./setup.sh antes de compilar.' >&2
    exit 1
fi
npm ci
node node_modules/electron/install.js
npm run build
npm test
"$PYTHON_BIN" -m pip install 'pyinstaller==6.22.3'
"$PYTHON_BIN" -m PyInstaller --noconfirm --distpath build/python-dist --workpath build/pyinstaller desktop/backend.spec
build/python-dist/mirros-backend/mirros-backend prepare --help
build/python-dist/mirros-backend/mirros-backend serve --help
ELECTRON_BUILDER_COMPRESSION_LEVEL="${ELECTRON_BUILDER_COMPRESSION_LEVEL:-5}" npm run pack:linux
