# MirrOS 1.3.0

Open-source iPhone screen mirroring, real-time audio streaming, 60 FPS screen recording, and USB HID control for Windows and Linux (`scrcpy` for iOS 17.4+ / iOS 18).

## Downloads / Descargas

- **Windows x64:** `Mirros-1.3.0-Windows.exe` — Portable executable: download and run.
- **Linux x64:** `Mirros-1.3.0-Linux-x64.AppImage` — Portable AppImage: make executable (`chmod +x`) and run.
- **Source Code:** `Mirros-1.3.0-Source.zip` — Generated from the verified release tag.
- **Checksums:** `SHA256SUMS.txt` — SHA-256 digests for all release artifacts.

Standalone packages bundle Electron, Python, and the MirrOS backend. Neither Python nor Node.js needs to be installed on the target machine.

## What's New in 1.3.0 / Novedades en 1.3.0

- **Unified Console (`mirros`) & Desktop Floating Phone View:** Running `mirros` in the terminal now serves the full MirrOS interface and opens by default in the compact floating phone window (`--floating` default, `--studio` for the full panel).
- **English-First Bilingual Interface (`EN` / `ES`):** MirrOS now defaults to **English (`EN`)** with instant 1-click switching to **Spanish (`ES`)** from the top toolbar, floating phone bar, or *Appearance → Language / Idioma*.
- **60 FPS Screen & Audio Recording (`Ctrl+Shift+R`):** Record WebM/MP4 video with synchronized iPhone audio directly from the toolbar or keyboard shortcut.
- **RVRA Resolution Switch & Linux VAAPI Padding Fix:** Eliminates top/left border shrinking during fast scrolling by detecting limited-range VAAPI padding (`RGB ≈ 139`), snapping `3px`/`18px` hardware scaler bleed to exact RVRA tiers (`720×1280`, `1088×1920`, `1170×2532`), and avoiding mid-motion PLI storms.
- **Live iOS Performance & Accessibility Toggles:** Toggle *Reduce Motion*, *Reduce Transparency*, and *Increase Contrast* live on the iPhone via CoreDevice to maintain maximum HEVC sharpness.
- **iOS Text Editing Shortcuts & Quick Gestures:** Native `Ctrl+A` (Select All), `Ctrl+X` (Cut), `Ctrl+Z` (Undo), extended HID keys (`Delete`, `Home`, `End`, `PageUp`, `PageDown`), and 1-click **Control Center** and **Notification Center** buttons.
- **Real-Time Battery Telemetry & Fullscreen (`F11`):** Live iPhone battery percentage, charging indicator, and device model badge in both Studio and Floating Phone modes.

## System Requirements / Requisitos

- Unlocked iPhone with a USB data cable, **"Trust This Computer"** accepted, and **Developer Mode** enabled (*Settings → Privacy & Security → Developer Mode*).
- **iOS 17.4 or newer** (including iOS 18) for userspace USB tunneling.
- **Windows:** *Apple Mobile Device Service* (via Apple Devices or iTunes).
- **Linux:** `usbmuxd` service (`sudo systemctl start usbmuxd`); `wl-clipboard` on Wayland for cross-app clipboard sharing.
