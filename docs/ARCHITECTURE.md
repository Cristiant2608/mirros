# Architecture Overview

MirrOS separates native iOS protocol handling (Python) from desktop windowing, low-latency rendering, and input synthesis (Electron + React + WebCodecs/WebAudio).

```
┌───────────────────────────┐        USB (usbmuxd / CoreDevice / RSD)        ┌─────────────────────────┐
│   iPhone (iOS 17+)        │ ◄──────────────────────────────────────────► │  Python Backend         │
│   DDI + Screen + Audio    │                                                │  (mirros.backend / CLI) │
│   HID + Clipboard + DVT   │                                                └───────────┬─────────────┘
└───────────────────────────┘                                                            │ Loopback HTTP/WS
                                                                             ┌───────────▼─────────────┐
                                                                             │  Desktop Shell / Browser│
                                                                             │  • Electron Main + IPC  │
                                                                             │  • Origin-checked Proxy │
                                                                             │  • React Studio & Rail  │
                                                                             │  • WebCodecs HEVC / PCM │
                                                                             └─────────────────────────┘
```

## Components

### 1. Python Backend (`src/mirros/`)
- **Device & Tunnel Lifecycle (`device.py`, `backend.py`, `runner.py`):** Discovers USB iPhones via `usbmuxd`, inspects trust/Developer Mode, auto-mounts the Developer Disk Image (DDI), opens CoreDevice userspace RSD (iOS 17.4+) or lockdown `--tunnel` fallback (iOS 17.0–17.3), and starts the local loopback server (`127.0.0.1`).
- **Media Streaming (`backend.py`, `video.py`):** Multiplexes raw HEVC NALUs (`/stream.bin`), AAC-ELD decoded stereo PCM (`/audio.bin`), software fallback PyAV JPEG frames (`/frames.bin`), and live camera/mic viewfinder frames via DVT Instruments.
- **HID, Clipboard & Telemetry (`backend.py`, `apps.py`):** Exposes low-latency touch, wheel, keyboard, system shortcut (`/app-switcher`, `/apps`, `/apps/launch`), display mode (`/display-mode`, `/wake`), appearance (`/style`), battery telemetry (`/battery`), and private diagnostics (`/diagnostics`) endpoints.

### 2. Electron Desktop Shell (`desktop/`)
- **Window & Mode Management (`main.cjs`, `window-geometry.cjs`):** Manages the unified floating phone window (`--floating` style) and expanded Studio window, custom edge/corner resizing, always-on-top pinning, and fullscreen (`F11`) geometry.
- **Security & Isolation (`proxy.cjs`):** Validates local origins before proxying WebSocket/HTTP traffic to the Python loopback server; enforces strict save dialogs (`capture.cjs`, `recording.cjs`) and signed/SHA-256-verified GitHub release self-updates (`updates.cjs`).
- **Cross-Platform Clipboard (`clipboard.cjs`, `clipboard-wayland.cjs`):** Synchronizes UTF-8 text and PNG images asynchronously between host (Windows, X11, Wayland via `wl-clipboard`) and iOS.

### 3. React + WebCodecs Frontend (`frontend/src/`)
- **Rendering & Audio (`App.jsx`, `audio-client.mjs`):** Uses hardware `VideoDecoder` when available or seamless `/frames.bin` JPEG canvas rendering, paired with an `AudioWorklet` jitter-resilient PCM player and synchronized UI controls (`i18n.js` supporting `EN` / `ES`).
- **Screen Recording (`recorder.mjs`):** Captures the live rendered canvas plus WebAudio track natively into WebM (VP9/VP8/Opus) or MP4 streams saved cleanly through Electron IPC.
