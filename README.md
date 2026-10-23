# MirrOS — Duplicación y control de iPhone por USB en Windows y Linux

<p align="center">
  <strong>🇪🇸 Español</strong> ·
  <strong><a href="README.en.md">🇬🇧 Read in English</a></strong> ·
  <strong><a href="https://cristiant2608.github.io/mirros/">🌐 Sitio Web Oficial</a></strong> ·
  <strong><a href="https://github.com/Cristiant2608/mirros/releases/latest">⬇️ Descargar última versión (v1.2.0)</a></strong>
</p>

[![Última versión](https://img.shields.io/github/v/release/Cristiant2608/mirros?label=versi%C3%B3n&color=5269c4)](https://github.com/Cristiant2608/mirros/releases/latest)
[![Descargas](https://img.shields.io/github/downloads/Cristiant2608/mirros/total?label=descargas&color=247454)](https://github.com/Cristiant2608/mirros/releases)
[![Desktop Packages CI](https://github.com/Cristiant2608/mirros/actions/workflows/packages.yml/badge.svg)](https://github.com/Cristiant2608/mirros/actions/workflows/packages.yml)
[![Plataformas](https://img.shields.io/badge/plataformas-Windows%20x64%20%7C%20Linux%20x64-blue)](https://github.com/Cristiant2608/mirros/releases/latest)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-lightgrey)](LICENSE)

**MirrOS** permite ver la pantalla, escuchar el audio y controlar tu **iPhone por USB desde Windows y Linux** con baja latencia (alternativa de código abierto estilo `scrcpy` para iOS / *iPhone Mirroring* en PC). Incluye una aplicación de escritorio lista para usar (**React + Electron**) y una herramienta de línea de comandos (`mirros` / `ios-scrcpy`) impulsada por `pymobiledevice3` y Apple CoreDevice.

> **🇬🇧 English Summary — iPhone Screen Mirroring & USB Control for Windows and Linux (`scrcpy` for iOS):**
> **MirrOS** brings native-like **iPhone Mirroring to Windows and Linux PCs over USB** (iOS 17.4+). It streams low-latency **HEVC hardware video** (with automatic **PyAV software fallback**), **AAC-ELD audio**, **HID touch/swipe gestures**, **App Switcher (multitasking)**, **PC keyboard & bidirectional clipboard (`Ctrl+C` / `Ctrl+V`)**, and **Always-On Display (AOD) standby mode**—packaged as standalone portable `.exe` (Windows x64) and `.AppImage` (Linux x64) binaries with Python bundled.

![Interfaz con contenido simulado](docs/screenshots/pantalla.png)

Las capturas del repositorio son simuladas. Las pruebas automáticas y las pruebas
con un teléfono se registran por separado en [Compatibilidad](docs/COMPATIBILIDAD.md).

## Características principales / Key Features

- **Vídeo fluido por USB:** Decodificación HEVC nativa vía WebCodecs y alternativa automática por software (PyAV/MJPEG con perfiles `economy`, `balanced` y `detail`).
- **Control total (ratón, gestos y teclado):** Toques, arrastres, rueda proporcional, gestos desde los bordes (Notificaciones, Centro de control, Inicio), **Selector de apps en segundo plano (Multitarea)** (`Ctrl+M` / `Ctrl+Tab`), puntero personalizable y escritura directa con el teclado del PC.
- **Audio en tiempo real:** Reproducción PCM mediante `AudioWorklet` con reserva adaptable y controles de volumen independientes para el PC y el iPhone.
- **Portapapeles bidireccional:** Copia y pega texto Unicode e imágenes PNG entre el PC y el iPhone con `Ctrl+C` y `Ctrl+V`.
- **Modo AOD / Reposo y ventana flotante:** Permite dejar descansar la pantalla física del iPhone mientras sigues interactuando desde el PC, con modo de teléfono flotante sin bordes y «Siempre encima».
- **Portátil y autónomo:** Ejecutables portátiles para Windows (`.exe`) y Linux (`.AppImage`) con actualizaciones verificadas por SHA-256.

## Descargar los portátiles

Descarga los archivos desde [GitHub Releases](https://github.com/Cristiant2608/mirros/releases/latest):

| Archivo | Uso |
| --- | --- |
| `Mirros-1.2.0-Windows.exe` | Portátil Windows x64: descargar y abrir. |
| `Mirros-1.2.0-Linux-x64.AppImage` | Portátil Linux x64: dar permiso de ejecución y abrir. |
| `Mirros-1.2.0-Source.zip` | Código fuente de la misma versión. |
| `SHA256SUMS.txt` | Sumas SHA-256 de los tres archivos. |

Los portátiles incluyen Electron y Python. El equipo de destino necesita el servicio
USB de Apple en Windows o `usbmuxd` en Linux, y el iPhone debe conceder confianza y
estar en Modo Desarrollador. La primera preparación puede necesitar Internet.

En Linux:

```bash
chmod +x Mirros-1.2.0-Linux-x64.AppImage
./Mirros-1.2.0-Linux-x64.AppImage
```

Durante el uso de la cámara o el micrófono, MirrOS activa automáticamente el visor
en vivo para que los controles táctiles y la grabación funcionen sin interrupciones.

## Requisitos

- iPhone desbloqueado, cable USB de datos y confianza concedida al ordenador.
- Modo Desarrollador activado en Ajustes → Privacidad y seguridad.
- iOS 17.4+ para el túnel USB en espacio de usuario; las versiones anteriores
  requieren un túnel externo y validación específica.
- Linux: servicio `usbmuxd`. Windows: Apple Mobile Device Service, instalado
  mediante Dispositivos Apple o iTunes. No se incluyen controladores de Apple.
- Desarrollo: Python 3.10+ y Node.js 22.12+. El visor de terminal necesita
  un navegador Chromium con HEVC; el escritorio incorpora alternativa por software.

## Instalar desde el código

Linux:

```bash
git clone https://github.com/Cristiant2608/mirros.git
cd mirros
./setup.sh
mirros --diagnose
mirros
```

En Arch/CachyOS: `sudo pacman -S --needed usbmuxd chromium`.
En Debian/Ubuntu: `sudo apt install usbmuxd chromium`.
En Fedora: `sudo dnf install usbmuxd chromium`.
Activa el servicio USB según tu distribución; en sistemas con la unidad disponible:
`sudo systemctl start usbmuxd`.

Windows, desde PowerShell en la carpeta del proyecto:

```powershell
.\setup.ps1
.\mirros.cmd --diagnose
.\mirros.cmd
```

Los instaladores crean o reutilizan `.venv`, instalan las dependencias declaradas y
comprueban su consistencia en cada ejecución. En Linux se crean los enlaces en
`~/.local/bin`; esa carpeta debe estar en `PATH`. `ios-scrcpy` se conserva como
alias del comando `mirros`, también en Windows mediante `ios-scrcpy.cmd`.

## Abrir el escritorio

Después de configurar Python:

```bash
pnpm install
node node_modules/electron/install.js
pnpm run build
pnpm start
```

El escritorio incluye video, gestos, teclado, audio, capturas, copiar/pegar con Ctrl+C y Ctrl+V,
ventana flotante y actualizaciones explícitas. Consulta la [guía de uso](docs/USO.md).
La transparencia y «Siempre encima» dependen del compositor Linux. En Wayland,
instala `wl-clipboard` para el portapapeles entre aplicaciones.
Consulta las [prioridades de mejora](docs/MEJORAS.md) y sus criterios de validación.

Para distribuir sin Python ni Node instalados en el equipo de destino:
`./build-linux.sh` genera un AppImage en `dist/linux`; `./build-windows.ps1`
genera el EXE portátil en `dist/windows`. Los paquetes publicados se descargan desde [Releases](https://github.com/Cristiant2608/mirros/releases).

## Comando de terminal

| Opción | Comportamiento |
| --- | --- |
| `--diagnose` | Comprueba entorno, navegador y detección USB sin transmitir. |
| `--version` | Muestra la versión instalada. |
| `--port PUERTO` | Usa un puerto de 1 a 65535; falla si está ocupado. |
| `--udid UDID` | Selecciona el teléfono; obligatorio cuando hay varios. |
| `--browser RUTA` | Selecciona un navegador Chromium. |
| `--audio` / `--no-audio` | Activa o desactiva el audio inicial del visor; desactivado por defecto. |
| `--force-software` | Fuerza la decodificación de video por software (MJPEG con PyAV) en lugar de WebCodecs HEVC. |
| `--video-quality {economy,balanced,detail}` | Selecciona el perfil de calidad/rendimiento para el video por software (`balanced` por defecto). |
| `--app-switcher` | Abre el selector de aplicaciones en segundo plano (multitarea) en una sesión activa. |
| `--list-apps` | Lista en la terminal las aplicaciones de usuario instaladas en el iPhone conectado por USB. |
| `--no-userspace` | Usa un túnel externo para el dispositivo. |

Sin `--port`, busca un puerto libre desde 8080. El servidor escucha en
`127.0.0.1`. Cada ejecución tiene su carpeta temporal privada y muestra la ruta
del registro. Los errores devuelven un código distinto de cero; SIGTERM solicita
el cierre de la sesión y devuelve 143 en Linux. Ctrl+C termina normalmente.

Cierra la ventana o usa «Desconectar de forma segura» antes de retirar el cable.
Si el cable ya se retiró, el programa puede cerrar sus procesos pero no garantiza
que el iPhone haya recibido la liberación de entrada.

## Desarrollo y estado del proyecto

- [Cómo contribuir y ejecutar las pruebas](CONTRIBUTING.md)
- [Arquitectura y responsabilidades](docs/ARQUITECTURA.md)
- [Compatibilidad y lista de validación física](docs/COMPATIBILIDAD.md)
- [Versiones y publicación mediante etiquetas](docs/ACTUALIZACIONES.md)
- [Revisión del PR #1 y cambios de integración](docs/REVISION-PR-1.md)
- [Historial](CHANGELOG.md)

`pyproject.toml` es la fuente de versión. Los cambios en `main` y los PR generan
paquetes de prueba; una publicación requiere una etiqueta `vX.Y.Z` del mismo
commit validado. No se publica al integrar un PR.

El código de MirrOS usa la licencia [MIT](LICENSE). El backend y las dependencias
conservan sus propias licencias; véase [NOTICE](desktop/NOTICE.txt).
