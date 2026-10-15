# iOS-Scrcpy

> Visualiza y controla la pantalla de tu iPhone desde Linux con baja latencia y control de ratón y teclado, similar a `scrcpy` en Android.

---

## 🚀 ¿Cómo funciona?

A diferencia de Android, donde `scrcpy` inyecta un servidor a través de `adb`, en iOS Apple restringe el acceso directo al sistema operativo.

Sin embargo, a partir de **iOS 17**, Apple introdujo el subsistema **CoreDevice / RemoteXPC**, el cual permite:
1. **Streaming de pantalla (HEVC/H.265)** en tiempo real a través del cable USB usando WebCodecs.
2. **Inyección de toques multitáctiles y pulsaciones de teclado** mediante el protocolo nativo `universal-hid-service`.

`ios-scrcpy` automatiza todo el proceso: levanta el túnel de comunicación en espacio de usuario (sin necesidad de permisos root para la red), inicia el servicio de streaming y abre una ventana nativa de escritorio sin bordes de navegador gracias a Chromium (`--app`), simulando la experiencia de `scrcpy`.

---

## 📋 Requisitos Previos

1. **En el iPhone:**
   - **iOS 17 o superior** (ej. iOS 17.x, iOS 18.x).
   - **Modo Desarrollador activado**:
     - Ve a `Ajustes` > `Privacidad y seguridad` > desplázate hasta el final y activa `Modo Desarrollador`.
     - El iPhone te pedirá reiniciar el dispositivo. Tras reiniciar, confirma la activación con tu código.
   - Conectar mediante cable USB al ordenador y presionar **"Confiar en este ordenador"**.

2. **En Linux (CachyOS / Arch Linux):**
   - El servicio `usbmuxd` (demonio de comunicación USB con dispositivos iOS):
     ```bash
     sudo pacman -S --needed usbmuxd
     sudo systemctl enable --now usbmuxd
     ```
   - Chromium (ya instalado para el modo app de ventana nativa).

---

## 💻 Uso

Una vez conectado el iPhone y desbloqueado, simplemente ejecuta:

```bash
ios-scrcpy
```

### Opciones de la línea de comandos

| Opción | Descripción |
| :--- | :--- |
| `-p, --port <PUERTO>` | Especificar un puerto TCP (por defecto busca el 8080 o el primer puerto libre). |
| `--no-audio` | Desactiva el streaming de audio en tiempo real. |
| `--no-userspace` | Fuerza el túnel de red a nivel de kernel (requiere root). Por defecto se usa el túnel de espacio de usuario. |
| `-u, --udid <UDID>` | Especificar el identificador del dispositivo si hay múltiples iPhones conectados. |
| `-b, --browser <RUTA>` | Especificar un navegador alternativo (por defecto usa Chromium). |

---

## 🎮 Controles y Atajos

| Acción | Control en Linux |
| :--- | :--- |
| **Toque táctil (Tap)** | Clic primario (izquierdo) del ratón |
| **Deslizar / Scroll (Swipe)** | Clic izquierdo sostenido y arrastrar |
| **Botón Inicio (Home)** | Clic secundario (derecho) o atajo `Ctrl + H` |
| **Bloquear pantalla (Lock)** | Atajo `Ctrl + L` |
| **Captura de pantalla (Screenshot)** | Atajo `Ctrl + P` (se guarda directamente en tu carpeta de descargas) |
| **Subir / Bajar volumen** | `Ctrl + ]` / `Ctrl + [` |
| **Activar Siri** | `Ctrl + S` |
| **Escribir texto** | Pulsaciones de teclado estándar de tu PC |

---

## 📁 Estructura del Proyecto

- `bin/ios-scrcpy`: Lanzador ejecutable enlazado en `~/.local/bin/ios-scrcpy`.
- `src/ios_scrcpy/`: Código fuente modular en Python.
  - `runner.py`: Coordinación de procesos en segundo plano y ventana de visualización.
  - `device.py`: Detección y diagnóstico de dispositivos conectados.
  - `cli.py`: Interfaz de comandos con `argparse`.
- `.venv/`: Entorno virtual autónomo con `pymobiledevice3` y sus dependencias.
- `setup.sh`: Script de configuración y diagnóstico rápido.
