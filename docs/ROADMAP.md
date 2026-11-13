# MirrOS Roadmap

[Español / Documentación](USO.md) · [Changelog](../CHANGELOG.md) · [Releases](https://github.com/Cristiant2608/mirros/releases)

This roadmap tracks planned engineering improvements, packaging channels, and user-facing features for **MirrOS** on **Windows and Linux** (no jailbreak, iOS 17.4+ / iOS 18). Priorities are organized by release horizon and verified constraints.

---

## Overview

| Horizon | Target | Focus | Key Deliverables |
| :--- | :--- | :--- | :--- |
| **Maintenance & Hygiene** | **`v1.3.x`** | Quality, CI stability, docs | English-first backend alignment, `ruff` + link validation in CI, Windows CI test hardening, `docs/ROADMAP.md`, `docs/notes/` archive, Help → Export Diagnostics button |
| **Packaging & Multi-Device** | **`v1.4.0`** | Easy install & multi-iPhone | Native `.deb` package in Releases, PyPI package (`pip install mirros`), `winget` / AUR manifests, visual multi-iPhone USB selector, per-device preferences |
| **Performance & Wireless** | **`v1.5.0`** | Lower CPU & local Wi-Fi | Optional WebGL/YUV renderer for software fallback, guided local Wi-Fi (`tunneld`) pairing option, A/V timestamp sync, community translations (PT/FR/DE/JA) |
| **Pro Ecosystem** | **`v2.0.0`** | Trust & automation | Code-signed Windows portable binary + SLSA provenance, exploratory macOS desktop support, scriptable CLI/HID QA automation macros |

---

## Detailed Milestones

### `v1.3.x` — Engineering Quality & Modularity (In Progress)
- [x] English-first desktop, web, and CLI localization with live `EN` / `ES` toggle (`v1.3.0`)
- [x] Interactive simulated demos & desktop workflow gallery across README and GitHub Pages
- [x] Linux `.deb` packaging target in `electron-builder` + CI release pipeline
- [x] Automated link validation, Python linting (`ruff`), and Dependabot monitoring
- [ ] Split [`src/mirros/adapter.py`](../src/mirros/adapter.py) into focused submodules (`adapter/hid_control.py`, `adapter/media_camera.py`, `adapter/device_info.py`, `adapter/server.py`)
- [ ] Extract frontend locales into `frontend/src/locales/{en,es}.json` and break `App.jsx` into `StudioShell` / `FloatingShell`
- [ ] Wire one-click **Export Diagnostic Report** directly inside the desktop Help tab

### `v1.4.0` — Distribution Channels & Multi-Device Workflow
- **Native package managers:** Publish Python wheel/sdist to PyPI (`pip install mirros` / `uv tool install mirros`), Debian `.deb` release asset, `winget` manifest, and AUR PKGBUILD.
- **Visual multi-device picker:** Detect multiple USB-connected iPhones in Desktop Studio and let users switch or launch dedicated floating windows without passing `--udid` in CLI.
- **Per-device persisted presets:** Remember theme, floating scale, audio preference, and pointer style per UDID (stored locally with zero cloud telemetry).

### `v1.5.0` — Rendering Efficiency, Audio/Video Sync & Community i18n
- **Optional YUV / WebGL fallback path:** Evaluate direct YUV frame upload in Chromium to eliminate JPEG encode/decode overhead when software decoding is active.
- **Audio / Video timestamp alignment:** Coordinate backend frame timestamps and `audio-worklet.js` adaptive buffering to prevent drift in long 60 FPS recordings.
- **Guided local Wi-Fi mirroring:** Documented, opt-in workflow via `pymobiledevice3` `tunneld` for USB-paired iPhones on trusted local networks.
- **Additional UI languages:** Community-friendly JSON localization files for Portuguese, French, German, and Japanese.

### `v2.0.0` — Trusted Binaries & Cross-Platform Expansion
- **Signed Windows executables:** Code signing for `Mirros-*-Windows.exe` alongside existing `SHA256SUMS.txt` digests and verifiable build provenance.
- **macOS support exploration:** Native Apple Silicon / Intel packaging parity while keeping Linux and Windows as first-class targets.
- **Scriptable HID / QA hooks:** Deterministic touch/key playback helpers for iOS app testing and automated demos.

---

## What Remains Explicitly Research-Only

MirrOS follows strict technical transparency and only ships capabilities backed by reproducible testing on real USB iOS devices:

- **Interactive mirroring with the iPhone screen physically powered completely off:** `CoreDevice` / `DisplayService` does not provide a supported USB path to turn off the OLED panel completely while keeping touch input and frame capture alive (see [`MEJORAS.md`](MEJORAS.md)). AOD / Standby dims and pauses lock interaction cleanly, rather than claiming true hardware panel shutoff.
- **Concurrent unrestricted sensor capture:** Camera/microphone access continues to isolate cleanly via DVT viewfinder + CoreDevice 9022 release rather than bypassing OS privacy hardware indicators.

Have an idea or want to contribute? Open a [Feature Request](https://github.com/Cristiant2608/mirros/issues/new?template=feature_request.yml) or read [`CONTRIBUTING.md`](../CONTRIBUTING.md).
