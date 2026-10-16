# MirrOS

Pantalla y control de iPhone por USB para Linux y Windows. Incluye una aplicación
React/Electron y un comando de terminal que abre el visor de `pymobiledevice3`.

![Interfaz con contenido simulado](docs/screenshots/pantalla.png)

Las capturas del repositorio son simuladas. Las pruebas automáticas y las pruebas
con un teléfono se registran por separado en [Compatibilidad](docs/COMPATIBILIDAD.md).

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
npm ci
node node_modules/electron/install.js
npm run build
npm start
```

El escritorio incluye video, gestos, teclado, audio, capturas, portapapeles manual,
ventana flotante y actualizaciones explícitas. Consulta la [guía de uso](docs/USO.md).
La transparencia y «Siempre encima» dependen del compositor Linux.

Para distribuir sin Python ni Node instalados en el equipo de destino:
`./build-linux.sh` genera un AppImage en `dist/linux`; `./build-windows.ps1`
genera el EXE portátil en `dist/windows`. Los paquetes publicados, cuando estén
disponibles, se descargan desde [Releases](https://github.com/Cristiant2608/mirros/releases).

## Comando de terminal

| Opción | Comportamiento |
| --- | --- |
| `--diagnose` | Comprueba entorno, navegador y detección USB sin transmitir. |
| `--version` | Muestra la versión instalada. |
| `--port PUERTO` | Usa un puerto de 1 a 65535; falla si está ocupado. |
| `--udid UDID` | Selecciona el teléfono; obligatorio cuando hay varios. |
| `--browser RUTA` | Selecciona un navegador Chromium. |
| `--audio` / `--no-audio` | Activa o desactiva el audio inicial del visor; desactivado por defecto. |
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
