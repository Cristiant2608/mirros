# MirrOS — Duplicación y control de iPhone por USB en Windows y Linux (`scrcpy` para iOS)

<p align="center">
  <strong><a href="README.md">🇺🇸 Read in English</a></strong> ·
  <strong>🇪🇸 Español</strong> ·
  <strong><a href="https://cristiant2608.github.io/mirros/">🌐 Sitio Web Oficial</a></strong> ·
  <strong><a href="https://github.com/Cristiant2608/mirros/releases/latest">⬇️ Descargar última versión (v1.2.0)</a></strong>
</p>

[![Última versión](https://img.shields.io/github/v/release/Cristiant2608/mirros?label=versi%C3%B3n&color=5269c4)](https://github.com/Cristiant2608/mirros/releases/latest)
[![Descargas](https://img.shields.io/github/downloads/Cristiant2608/mirros/total?label=descargas&color=247454)](https://github.com/Cristiant2608/mirros/releases)
[![Desktop Packages CI](https://github.com/Cristiant2608/mirros/actions/workflows/packages.yml/badge.svg)](https://github.com/Cristiant2608/mirros/actions/workflows/packages.yml)
[![Plataformas](https://img.shields.io/badge/plataformas-Windows%20x64%20%7C%20Linux%20x64-blue)](https://github.com/Cristiant2608/mirros/releases/latest)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-lightgrey)](LICENSE)

**MirrOS** permite ver la pantalla, escuchar el audio, grabar vídeo y controlar tu **iPhone por USB desde Windows y Linux** con baja latencia (alternativa de código abierto estilo `scrcpy` para iOS 17.4+ e iOS 18). Incluye una aplicación de escritorio lista para usar (**React + Electron**) y una herramienta de línea de comandos (`mirros` / `ios-scrcpy`) con selector de idioma integrado (**Inglés `EN` / Español `ES`**).

![Interfaz con contenido simulado](docs/screenshots/pantalla.png)

Las capturas del repositorio son simuladas. Las pruebas automáticas y las pruebas con un teléfono se registran por separado en [Compatibilidad](docs/COMPATIBILIDAD.md).

---

## Características principales

- **Vídeo fluido por USB a 60 FPS (sin caídas de resolución RVRA):** Decodificación HEVC nativa vía WebCodecs con compensación automática de escalones RVRA en Linux/VAAPI y alternativa automática por software (PyAV/MJPEG con perfiles `economy`, `balanced` y `detail`).
- **Control total (ratón, gestos rápidos y teclado):** Toques, arrastres, rueda proporcional, gestos directos para **Centro de Control**, **Centro de Notificaciones** y **Selector de apps (Multitarea)** (`Ctrl+M` / `Ctrl+Tab`), clic derecho para volver a Inicio, puntero personalizable y escritura directa con el teclado del PC (`Ctrl+A`, `Ctrl+C`, `Ctrl+X`, `Ctrl+V` y `Ctrl+Z`).
- **Visor de Cámara en vivo y aislamiento de micrófono:** Al abrir la app Cámara de iOS, MirrOS conmuta automáticamente al visor en directo vía DVT Instruments sin bloqueos por el error CoreDevice 9022.
- **Grabación de pantalla y audio (`Ctrl+Shift+R`):** Exporta grabaciones WebM/MP4 a 60 FPS y capturas PNG (`Ctrl+P`).
- **Ajustes de Rendimiento / Accesibilidad de iOS en vivo:** Conmuta *Reducir movimiento*, *Reducir transparencia* y *Aumentar contraste* directamente desde MirrOS para maximizar la nitidez HEVC.
- **Audio en tiempo real y telemetría de batería:** Reproducción PCM mediante `AudioWorklet` con reserva adaptable, controles de volumen independientes e indicador de batería y modelo del iPhone en vivo.
- **Modo AOD / Reposo y vista de Solo Teléfono flotante:** Permite dejar descansar la pantalla física del iPhone mientras sigues interactuando desde el PC, con vista compacta de solo celular tanto en escritorio como al ejecutar `mirros` por consola.
- **Interfaz bilingüe (`EN` / `ES`):** Inglés por defecto con cambio instantáneo a Español en un clic desde la barra superior, los controles flotantes o la pestaña Apariencia.

---

## Descargar los portátiles

Descarga los archivos desde [GitHub Releases](https://github.com/Cristiant2608/mirros/releases/latest):

| Archivo | Uso |
| --- | --- |
| `Mirros-1.2.0-Windows.exe` | Portátil Windows x64: descargar y abrir. |
| `Mirros-1.2.0-Linux-x64.AppImage` | Portátil Linux x64: dar permiso de ejecución (`chmod +x`) y abrir. |
| `Mirros-1.2.0-Source.zip` | Código fuente de la misma versión. |
| `SHA256SUMS.txt` | Sumas SHA-256 de los archivos publicados. |

En Linux:

```bash
chmod +x Mirros-1.2.0-Linux-x64.AppImage
./Mirros-1.2.0-Linux-x64.AppImage
```

---

## Requisitos

- iPhone desbloqueado, cable USB de datos y confianza concedida al ordenador.
- Modo Desarrollador activado en *Ajustes → Privacidad y seguridad*.
- iOS 17.4+ para el túnel USB en espacio de usuario; las versiones anteriores requieren un túnel externo.
- Linux: servicio `usbmuxd`. Windows: *Apple Mobile Device Service* (instalado mediante Dispositivos Apple o iTunes).

---

## Instalar desde el código

### Linux

```bash
git clone https://github.com/Cristiant2608/mirros.git
cd mirros
./setup.sh
mirros --diagnose
mirros
```

### Windows (PowerShell)

```powershell
.\setup.ps1
.\mirros.cmd --diagnose
.\mirros.cmd
```

### Abrir el escritorio desde el código

```bash
pnpm install
node node_modules/electron/install.js
pnpm run build
pnpm start
```

---

## Comando de terminal (`mirros` / `ios-scrcpy`)

| Opción | Comportamiento |
| --- | --- |
| `--diagnose` | Comprueba entorno, navegador y detección USB sin transmitir. |
| `--version` | Muestra la versión instalada. |
| `--port PUERTO` | Usa un puerto de 1 a 65535; por defecto busca uno libre desde 8080. |
| `--udid UDID` | Selecciona el teléfono; obligatorio cuando hay varios. |
| `--browser RUTA` | Selecciona un navegador Chromium. |
| `--audio` / `--no-audio` | Activa o desactiva el audio inicial del visor. |
| `--force-software` | Fuerza la decodificación de video por software (MJPEG con PyAV). |
| `--video-quality {economy,balanced,detail}` | Selecciona el perfil de calidad/rendimiento para el video por software. |
| `--app-switcher` | Abre el selector de aplicaciones en segundo plano (multitarea) en una sesión activa. |
| `--list-apps` | Lista en la terminal las aplicaciones de usuario instaladas en el iPhone. |
| `--floating` / `--studio` | Abre la vista compacta de solo teléfono flotante (por defecto) o el panel completo Studio (`--studio`). |
| `--no-userspace` | Usa un túnel externo para el dispositivo. |

---

## Documentación y enlaces

- [🇺🇸 English README](README.md)
- [Guía de uso](docs/USO.md)
- [Arquitectura y responsabilidades](docs/ARQUITECTURA.md)
- [Compatibilidad y validación física](docs/COMPATIBILIDAD.md)
- [Cómo contribuir](CONTRIBUTING.md)
- [Política de seguridad](SECURITY.md)
- [Historial de cambios](CHANGELOG.md)

El código de MirrOS usa la licencia [MIT](LICENSE).
