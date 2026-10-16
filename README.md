# MirrOS 🪞📱

> **MirrOS**: Visualiza y controla la pantalla de tu iPhone desde Linux en tiempo real con baja latencia y soporte completo para ratón y teclado.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux-blue.svg)](https://kernel.org)
[![iOS: 17+](https://img.shields.io/badge/iOS-17%2B-black.svg)](https://apple.com/ios)

---

## ✨ Características

- ⚡ **Streaming en tiempo real**: Transmisión fluida a 60 fps mediante códec de video por hardware HEVC/H.265 sobre el bus USB.
- 🖱️ **Control táctil con ratón**: Clic para tocar (*Tap*), clic sostenido para deslizar (*Swipe / Scroll*), clic derecho para volver al Inicio (*Home*).
- ⌨️ **Escritura con teclado**: Envía pulsaciones de teclado directamente a los campos de texto del iPhone.
- 🎛️ **Atajos de hardware integrados**: Bloqueo de pantalla, botón Home, Siri, control de volumen y captura de pantalla.
- 🖥️ **Ventana de escritorio nativa**: Se ejecuta en una ventana limpia e independiente sin barras de navegador mediante Chromium en modo aplicación.
- 🔒 **Sin Jailbreak ni Mac**: Funciona directamente en Linux aprovechando los protocolos oficiales de desarrollo de Apple (*CoreDevice / RemoteXPC*).

---

## 📋 Requisitos Previos

### 1. En el iPhone:
- **iOS 17 o superior** (iOS 17.x, iOS 18.x).
- **Modo Desarrollador activado**:
  - En tu iPhone ve a `Ajustes` > `Privacidad y seguridad` > desplázate hasta abajo y activa **Modo Desarrollador**.
  - Confirma el reinicio del dispositivo. Al encenderse, pulsa **Activar** e ingresa tu código de desbloqueo.
  *(Nota: Si la opción no aparece en los ajustes, MirrOS o `idevicedevmodectl reveal` la harán visible automáticamente por USB).*
- Conecta el iPhone con cable USB a tu PC y pulsa **"Confiar en este ordenador"**.
- Mantén el iPhone **desbloqueado** en la pantalla de inicio para permitir la interacción táctil.

### 2. En Linux (CachyOS / Arch / Debian / Fedora):
- El servicio `usbmuxd`:
  ```bash
  # Arch / CachyOS / Manjaro:
  sudo pacman -S --needed usbmuxd
  sudo systemctl enable --now usbmuxd

  # Debian / Ubuntu / Mint:
  sudo apt install usbmuxd
  sudo systemctl enable --now usbmuxd
  ```
- Navegador basado en Chromium (Chromium, Google Chrome, Brave, etc.) para el visor de ventana limpia.

---

## 🚀 Instalación Rápida

Clona el repositorio y ejecuta el instalador:

```bash
git clone https://github.com/Cristiant2608/mirros.git
cd mirros
./setup.sh
```

El script configurará el entorno virtual y creará el comando global `mirros` en `~/.local/bin/mirros`.

---

## 💻 Uso

Simplemente conecta tu iPhone desbloqueado y ejecuta en tu terminal:

```bash
mirros
```

### Opciones de línea de comandos

```text
Uso: mirros [-h] [-v] [-p PORT] [--audio] [--no-userspace] [-u UDID] [-b BROWSER]

Opciones:
  -h, --help            Muestra este mensaje de ayuda y termina.
  -v, --version         Muestra la versión de MirrOS instalada.
  -p, --port PORT       Puerto TCP para el servidor local (por defecto: 8080).
  --audio               Habilita transmisión de audio (requiere AudioToolbox).
  --no-userspace        Usa túnel de kernel en lugar del túnel en espacio de usuario.
  -u, --udid UDID       Especifica el UDID de un iPhone concreto si hay varios conectados.
  -b, --browser BROWSER Ruta o binario de navegador personalizado (ej. brave-browser).
```

---

## 🎮 Controles y Atajos

| Acción | Control en Linux |
| :--- | :--- |
| **Toque táctil (Tap)** | Clic primario (izquierdo) del ratón |
| **Deslizar / Scroll (Swipe)** | Clic izquierdo sostenido y arrastrar |
| **Botón Inicio (Home)** | Clic secundario (derecho) o atajo `Ctrl + H` |
| **Bloquear pantalla (Lock)** | Atajo `Ctrl + L` |
| **Captura de pantalla** | Atajo `Ctrl + P` (se guarda automáticamente) |
| **Subir / Bajar volumen** | `Ctrl + ]` / `Ctrl + [` |
| **Activar Siri** | `Ctrl + S` |
| **Escribir texto** | Pulsaciones de teclado estándar de tu PC |

---

## 🔊 ¿Cómo escuchar el audio del iPhone en Linux?

En Linux, la forma más limpia y con calidad de audio completa es emparejar tu iPhone por Bluetooth a tu PC (vía PipeWire / PulseAudio A2DP Sink):

1. En tu terminal haz visible el Bluetooth de tu PC:
   ```bash
   bluetoothctl discoverable on
   ```
2. En tu iPhone ve a `Ajustes > Bluetooth` y selecciona tu PC.
3. ¡Listo! Todo el sonido de juegos, videos y música se escuchará directamente por los altavoces o auriculares de tu PC con Linux.

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia [MIT](LICENSE).
