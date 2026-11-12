# Contributing to MirrOS

Work on a feature branch and open a Pull Request against `main`. Clearly describe the problem, the observable change, and how you verified it. Keep USB transport fixes, UI changes, and release-packaging changes in focused commits whenever possible.

## Development Setup

- **Linux:** `./setup.sh`
- **Windows:** `.\setup.ps1` (automatically accelerated with `uv` when installed)
- **Desktop UI:** `pnpm install`, `node node_modules/electron/install.js`, `pnpm run build`
- `pnpm start` launches the Electron desktop app; `mirros` launches the backend server and opens the floating phone view.

## Verification Checks

```bash
.venv/bin/python -m unittest discover -s tests -v
pnpm test
pnpm run audit
pnpm run verify:build-proxy
pnpm run build
bash -n setup.sh build-linux.sh bin/mirros bin/ios-scrcpy
```

On Windows, use `.venv\Scripts\python.exe` for Python commands and skip the Bash syntax check. CI covers Python 3.10/3.12 on Windows and Ubuntu. Automated tests must never depend on a physical iPhone or personal device data.

Test session-level changes against the [Physical Compatibility Checklist](docs/COMPATIBILIDAD.md) and record OS, iOS version, commit, and outcome. Never include UDIDs, personal device names, screen contents, or clipboard data in commits or test fixtures.

## Architecture & Packaging

See [Architecture](docs/ARQUITECTURA.md). Isolate any private `pymobiledevice3` API touches inside `src/mirros/adapter.py` and add a unit regression test. Never modify files inside `site-packages`.

To bump the version, edit `pyproject.toml` and run `pnpm run version:sync`. `pnpm run version:check` verifies version synchronization across Python and Node manifests before tests and builds.
