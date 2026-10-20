# MirrOS — iPhone Screen Mirroring & USB Control for Windows and Linux

<p align="center">
  <strong><a href="README.md">🇪🇸 Leer en Español</a></strong> ·
  <strong>🇬🇧 English</strong> ·
  <strong><a href="https://cristiant2608.github.io/mirros/">🌐 Official Website</a></strong> ·
  <strong><a href="https://github.com/Cristiant2608/mirros/releases/latest">⬇️ Download Latest Release (v1.1.7)</a></strong>
</p>

[![Latest Release](https://img.shields.io/github/v/release/Cristiant2608/mirros?label=release&color=5269c4)](https://github.com/Cristiant2608/mirros/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Cristiant2608/mirros/total?label=downloads&color=247454)](https://github.com/Cristiant2608/mirros/releases)
[![Desktop Packages CI](https://github.com/Cristiant2608/mirros/actions/workflows/packages.yml/badge.svg)](https://github.com/Cristiant2608/mirros/actions/workflows/packages.yml)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20x64%20%7C%20Linux%20x64-blue)](https://github.com/Cristiant2608/mirros/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

**MirrOS** is an open-source **iPhone screen mirroring, real-time audio streaming, and USB HID control** tool for **Windows and Linux** (a `scrcpy`-like experience for iOS 17.4+ powered by `pymobiledevice3` and Apple CoreDevice). It includes both a ready-to-use **React + Electron desktop application** and a command-line launcher (`mirros` / `ios-scrcpy`).

![MirrOS Desktop Studio with simulated screen](docs/screenshots/pantalla.png)

> *All repository screenshots use a generated simulated iPhone display and contain no personal device data. Automated CI checks and physical device validations are tracked separately in [Compatibility](docs/COMPATIBILIDAD.md).*

---

## Key Capabilities

| Feature | Description |
| --- | --- |
| **Low-Latency USB Video** | Native **HEVC** hardware decoding via Chromium WebCodecs, with automatic **PyAV/FFmpeg software fallback** (`economy`, `balanced`, and `detail` profiles) when browser HEVC is unavailable. |
| **HID Touch, Edge Swipes & Pointer** | Accurate normalized touch, long press hold preservation, proportional vertical/horizontal mouse wheel scrolling, 8px edge-snap gestures (Notifications, Control Center, Home), and customizable in-phone cursor (Arrow, Circle, Dot). |
| **App Switcher & Installed Apps** | Open iOS background multitasking (**App Switcher**) via toolbar button, `Ctrl+M` / `Ctrl+Tab`, or `mirros --app-switcher`, plus a searchable **Installed Applications** viewer (`mirros --list-apps`). |
| **PC Keyboard & Bidirectional Clipboard** | Type directly on your iPhone from your PC keyboard and copy/paste Unicode text and PNG images in both directions with `Ctrl+C` and `Ctrl+V`. |
| **Real-Time AAC-ELD Audio** | Streams iPhone audio to your PC using an adaptive `AudioWorklet` jitter buffer (120–240 ms) with independent PC and iPhone volume controls. |
| **AOD / Standby Mode & Floating Phone** | Detach the iPhone into a borderless, transparent, always-on-top floating window, or switch to **AOD / Standby Mode** (`Ctrl+L` / `Ctrl+U`) so the physical iPhone screen rests while mirroring continues on your PC. |
| **Standalone Portable Packages** | Self-contained `.exe` (Windows x64) and `.AppImage` (Linux x64) packages with Python and Electron bundled, plus SHA-256 verified updates. |

---

## Download Portable Packages (No Python or Node.js Required)

Download the latest binaries from [GitHub Releases](https://github.com/Cristiant2608/mirros/releases/latest):

| File | Usage |
| --- | --- |
| `Mirros-1.1.7-Windows.exe` | **Windows x64 Portable:** download and run the `.exe`. |
| `Mirros-1.1.7-Linux-x64.AppImage` | **Linux x64 Portable:** make executable (`chmod +x`) and run. |
| `Mirros-1.1.7-Source.zip` | Source code archive from the verified release tag. |
| `SHA256SUMS.txt` | SHA-256 checksums for all release artifacts. |

On Linux:

```bash
chmod +x Mirros-1.1.7-Linux-x64.AppImage
./Mirros-1.1.7-Linux-x64.AppImage
```

> **Note on iPhone Camera & Microphone:** CoreDevice screen streaming prevents simultaneous use of the iPhone's physical camera and microphone. Click **Safe Disconnect** (*Desconectar de forma segura*) and wait for the session to close before opening the Camera app on your iPhone.

---

## System Requirements

1. **Unlocked iPhone**, a **USB data cable**, and **"Trust This Computer"** accepted on the device.
2. **Developer Mode** enabled on the iPhone (*Settings → Privacy & Security → Developer Mode*).
3. **iOS 17.4 or newer** for unprivileged userspace USB tunneling (older iOS versions require an external `tunneld` instance).
4. **USB Driver / Service**:
   - **Windows:** *Apple Mobile Device Service* (installed via Apple Devices or iTunes). Apple USB drivers are not bundled.
   - **Linux:** `usbmuxd` service running (`sudo systemctl start usbmuxd`). On Wayland, install `wl-clipboard` for cross-app clipboard sharing.
5. **Internet connection** may be needed on the very first run so `pymobiledevice3` can fetch the matching Apple Developer Disk Image (DDI).

---

## Install from Source (CLI & Development)

### Linux

```bash
git clone https://github.com/Cristiant2608/mirros.git
cd mirros
./setup.sh
mirros --diagnose
mirros
```

Install system packages according to your distribution:
- **Arch / CachyOS:** `sudo pacman -S --needed usbmuxd chromium wl-clipboard`
- **Debian / Ubuntu:** `sudo apt install usbmuxd chromium wl-clipboard`
- **Fedora:** `sudo dnf install usbmuxd chromium wl-clipboard`

### Windows (PowerShell)

```powershell
.\setup.ps1
.\mirros.cmd --diagnose
.\mirros.cmd
```

Both setup scripts use [`uv`](https://docs.astral.sh/uv/) automatically when available (with `pip` fallback) to create `.venv` and validate package dependencies. The `ios-scrcpy` alias is installed alongside `mirros`.

### Running the Desktop Studio from Source

```bash
pnpm install
node node_modules/electron/install.js
pnpm run build
pnpm start
```

To build standalone distributables locally:
- **Linux AppImage:** `./build-linux.sh` → outputs to `dist/linux/`
- **Windows Portable EXE:** `./build-windows.ps1` → outputs to `dist/windows/`

---

## Command-Line Interface (`mirros` / `ios-scrcpy`)

| Option | Behavior |
| --- | --- |
| `--diagnose` | Checks Python environment, PyAV decoder, browser, and USB detection without starting a stream (redacts UDIDs and private paths). |
| `--version` | Prints the installed MirrOS version. |
| `--udid UDID` | Selects a specific iPhone by UDID (required when multiple devices are connected). |
| `--port PORT` | Binds the local server (`127.0.0.1`) to a specific port (`1–65535`); defaults to the first free port from `8080`. |
| `--browser PATH` | Launches a specific Chromium-based browser binary. |
| `--audio` / `--no-audio` | Enables or disables initial audio streaming in the browser viewer (disabled by default in CLI). |
| `--force-software` | Forces software video decoding (MJPEG via PyAV) instead of WebCodecs HEVC. |
| `--video-quality {economy,balanced,detail}` | Sets the software video profile (`economy`: 20 FPS / 960px, `balanced`: 28 FPS / 1280px, `detail`: 30 FPS / 1568px). |
| `--app-switcher` | Triggers the iOS App Switcher (background multitasking) on an active session. |
| `--list-apps` | Lists user-installed applications on the USB-connected iPhone in the terminal. |
| `--no-userspace` | Uses an external tunnel instead of the built-in userspace tunnel. |

---

## Keyboard Shortcuts (Viewer Focused)

| Action | Shortcut |
| --- | --- |
| Home Screen | `Ctrl + H` or Right-Click |
| App Switcher (Multitasking) | `Ctrl + M` or `Ctrl + Tab` |
| Copy from iPhone to PC | `Ctrl + C` |
| Paste from PC to iPhone | `Ctrl + V` |
| Lock iPhone / AOD Standby | `Ctrl + L` |
| Wake & Unlock Gesture | `Ctrl + U` |
| Save PNG Screenshot | `Ctrl + P` |
| iPhone Volume Down / Up | `Ctrl + [` / `Ctrl + ]` |
| Invoke Siri | `Ctrl + S` |

---

## Documentation & Project Links

- [Usage Guide (Spanish)](docs/USO.md)
- [Architecture & Process Model](docs/ARQUITECTURA.md)
- [Compatibility Matrix & Physical Validation Checklist](docs/COMPATIBILIDAD.md)
- [Performance & Optimization Notes](docs/OPTIMIZACION.md)
- [Release & Update Verification Workflow](docs/ACTUALIZACIONES.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

MirrOS is released under the [MIT License](LICENSE). Third-party dependencies retain their own licenses; see [NOTICE](desktop/NOTICE.txt).
