# Releases & Versioning

See also: [ACTUALIZACIONES.md (Spanish Update Mechanism Notes)](ACTUALIZACIONES.md), [Roadmap](ROADMAP.md), and [CHANGELOG](https://github.com/Cristiant2608/mirros/releases).

MirrOS keeps its semantic version synchronized across `package.json`, `pyproject.toml`, and `src/mirros/__init__.py` via `scripts/version.mjs` (`pnpm run version:check`).

## Linux `.deb` & PyPI Distribution Automation

- **Debian / Ubuntu `.deb`:** Configured in [`electron-builder.yml`](../electron-builder.yml) alongside `.AppImage` and staged automatically by [`packages.yml`](../.github/workflows/packages.yml) starting with the next tagged release after `1.3.0`.
- **PyPI (`pip install mirros`):** Package build verification (`uv build` + `twine check`) and opt-in Trusted Publishing live in [`.github/workflows/pypi.yml`](../.github/workflows/pypi.yml) (`vars.MIRROS_PYPI_PUBLISH == 'true'` or manual `workflow_dispatch`).

## v1.3.0 — Unified Floating UI, Live Viewfinder, Recording & English-First Globalization

- **Unified Floating Phone Interface:** Phone-only floating viewport with collapsible docked controls rail alongside the expandable Studio workspace (`--floating` default, `--studio` panel flag).
- **Screen & Audio Recording:** Built-in WebM / MP4 capture combining 60 FPS canvas video and live PCM audio (`Ctrl + Shift + R`).
- **Live Camera Viewfinder (CoreDevice 9022):** Automatic DVT Instruments viewfinder fallback whenever iOS locks normal mirroring for Camera or Microphone usage.
- **Full English-First Localization + Live `EN / ES` Toggle:** Default English UI, CLI (`--lang en|es`), Python diagnostics, desktop runtime messages, and English documentation with instant runtime bilingual toggle.
- **Live Battery Telemetry, iOS Appearance & Performance Toggles:** Real-time battery status badge, native iOS Dark/Light toggle, and CoreDevice accessibility optimizations (Reduce Motion / Reduce Transparency / Increase Contrast).
- **Wayland Native Clipboard Support:** First-class UTF-8 & PNG sync on Wayland desktop compositors (`wl-clipboard`).
- **SEO & Web Discoverability:** Updated bilingual landing page, Open Graph social preview, web app manifest, sitemap, and `CITATION.cff`.

## Update Security Model

Built-in GitHub Releases updates follow strict verification rules (`desktop/updates.cjs`):
1. Only accepts stable semantic versions newer than the installed release.
2. Only downloads from the official repository (`https://github.com/Cristiant2608/mirros/`).
3. Verifies every downloaded portable `.exe` or `.AppImage` byte-for-byte against its release SHA-256 digest before staging a backed-up swap on restart.
