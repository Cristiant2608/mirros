# Compatibility & Troubleshooting

[Versión en español (COMPATIBILIDAD.md)](COMPATIBILIDAD.md)

## Supported Platforms

| Platform | Runtime Options | USB Stack Required |
| :--- | :--- | :--- |
| **Windows 10 / 11 (x64)** | Portable `.exe` (`MirrOS-1.3.0-Windows.exe`) or Python + Chromium/Edge | Apple Devices (Microsoft Store) or Apple iTunes USB driver (AMDS) |
| **Linux (x64)** | `.AppImage` / `.deb` (`MirrOS-1.3.0-Linux.*`) or Python + Chromium | `usbmuxd` (`sudo systemctl enable --now usbmuxd`) + `libimobiledevice` |
| **iPhone (USB)** | iOS 17.0+ (iOS 17.4+ uses CoreDevice userspace RSD; iOS 17.0–17.3 falls back automatically to `--tunnel`) | USB data cable + Trust + Developer Mode enabled |

## Video Decoding Compatibility

MirrOS receives an H.265 / HEVC video stream directly from iOS:

1. **Hardware WebCodecs (Default):** Zero-transcode native `VideoDecoder` when supported by your Chromium/Electron GPU stack (Windows D3D/DXVA, Linux VA-API/Vulkan with HEVC support).
2. **Automatic Software Fallback (PyAV):** On Linux GPUs or drivers without HEVC hardware decoding, MirrOS seamlessly switches to PyAV JPEG frames (`economy` 960p @ 20 FPS, `balanced` 1568p @ 30 FPS, `detail` 2160p @ 30 FPS). You can also force this mode explicitly with `--force-software` or inside Studio → Appearance/Screen.

## Common Issues & Fixes

- **"Connect your iPhone via USB" persists:**
  - Verify your cable supports data transfer (avoid charge-only cables).
  - On Windows, ensure Apple Mobile Device Service is running or Apple Devices / iTunes is installed.
  - On Linux, run `sudo systemctl enable --now usbmuxd`.
- **"Unlock your iPhone and tap Trust":**
  - Unlock the iPhone screen while plugged in and accept the Trust Computer prompt.
- **Developer Mode missing in Settings:**
  - Connect once while running `mirros` or open **Privacy & Security** on iPhone — MirrOS triggers the reveal flag automatically when inspecting the device.
- **CoreDevice Error 9022 (Camera or Microphone in use):**
  - iOS restricts screen mirroring while the physical camera or microphone is active. MirrOS detects Error `9022` and opens the **DVT Instruments Live Viewfinder** automatically, then resumes 60 FPS mirroring when you leave the camera.
- **Black screen during AOD / Standby:**
  - In AOD / Standby mode, iOS may stop emitting display frames after locking. Click **Wake** (`Ctrl + U`) to return to Dual Screen Mode.
- **Wayland Clipboard on Linux:**
  - Installing `wl-clipboard` enables direct native PNG and UTF-8 clipboard sync on Wayland compositors (including Hyprland, Sway, and GNOME Wayland).
