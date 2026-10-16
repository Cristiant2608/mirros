# Mirros 2.0 — iPhone por USB

Aplicación de escritorio con interfaz React en español. El ejecutable portátil
incluye Electron y Python; no necesita abrir un navegador ni instalar Python.

## Aplicación de Windows

Abre `Mirros-2.0.0-Windows.exe` y conecta el iPhone por USB. Mantén el teléfono
desbloqueado, acepta «Confiar» y activa Modo Desarrollador. La primera preparación
puede descargar la imagen de desarrollo compatible.

- **Ventana flotante:** ventana transparente y redondeada, sin paneles ni fondo.
  Los controles están en una barra lateral fija, fuera de la imagen. Una pestaña permite guardarlos bajo el teléfono y volver a desplegarlos. Arrastra desde el asa para mover la ventana
  y desde los bordes o esquinas para cambiar el tamaño del teléfono.
- **Girar:** «Girar vista 90°» gira la imagen y adapta los toques. Se solicita también
  el giro del dispositivo; si iOS lo rechaza o mantiene la app vertical, se indica
  en pantalla. La vista sigue los cambios de orientación que comunica iOS.
- **Siempre encima:** fija la ventana sobre las demás aplicaciones.
- **Tamaño libre:** arrastra cualquier borde o esquina; la imagen conserva su proporción.
  La barra mantiene su tamaño. «Usar todo el alto disponible» amplía el teléfono
  hasta el área útil del monitor. También hay tamaños predefinidos en Apariencia.
- **Toques:** clic para tocar, arrastra para deslizar, clic derecho para Inicio.
- **Rueda del ratón:** desplaza el contenido del iPhone con gestos táctiles.
  Puedes ajustar la sensibilidad en «Apariencia».
- **Temas:** Claro, Oscuro, Lavanda y Océano, con opción de seguir el sistema.
  La elección se guarda entre sesiones y se aplica también a los controles flotantes.
- **Navegación:** Pantalla, Audio, Portapapeles, Apariencia y Ayuda. Cambiar de
  sección mantiene el visor y la conexión del dispositivo.
- **Teclado:** haz clic en la pantalla para escribir. Al cambiar el foco,
  las teclas dejan de enviarse al teléfono.
- **Audio en este PC:** activado por defecto, con interruptor y volumen propio.
  Utiliza los altavoces o audífonos predeterminados de Windows.
- **Audio del iPhone:** botones de volumen y «Alternar silencio», separados del
  volumen del PC. iOS informa el estado; el transporte no permite leerlo.
  El botón Silencio puede no silenciar música o videos. No se garantiza un
  modo «solo PC» hasta verificar cómo responde el dispositivo.
- **Salida segura:** usa «Desconectar de forma segura» antes de retirar el cable.
  Libera teclas y toques, cierra el teclado virtual y detiene la sesión. Cerrar
  Mirros también solicita ese cierre antes de terminar el proceso. Las solicitudes
  vacías de teclado ya no registran un teclado externo; una espera de cinco segundos
  sin actividad libera el teclado. Si el cable ya se retiró, la limpieza del iPhone
  no puede garantizarse y debe comprobarse físicamente.
- **Capturas:** guarda una imagen PNG desde el botón Captura.
- **Portapapeles:** los botones «PC → iPhone» e «iPhone → PC» transfieren texto
  o imágenes. Después pega en la aplicación de destino. En el modo flotante,
  usa los iconos de enviar y descargar de la barra lateral. Las transferencias
  son manuales; Mirros no sincroniza ni lee el portapapeles en segundo plano.

El apagado independiente del panel físico del iPhone no está implementado:
el transporte utilizado no expone esa función. Tampoco permite crear una pantalla
virtual independiente como `scrcpy --new-display` en Android. «Bloquear» bloquea el dispositivo;
no se utiliza automáticamente al iniciar o cerrar una sesión.

### Estado de compatibilidad

| Componente | Windows | Linux |
| --- | --- | --- |
| Lanzador Python y USB | Probado con iPhone | Rutas y pruebas de regresión en CI |
| Interfaz React y entrada | Probadas en Windows | Código compartido; ejecución real pendiente |
| Escritorio y cierre de procesos | Nativo | Rutas POSIX y grupos de procesos; validación real pendiente |
| Audio AAC-ELD | Probado con iPhone | PyAV habilitado; prueba de sonido real pendiente |
| Empaquetado | EXE portátil probado | Script AppImage incluido; compilación en Linux pendiente |

El flujo de CI está configurado para Windows y Linux con Python 3.10/3.12 y la compilación de React.
Mientras no se ejecute la CI y se pruebe un iPhone en Linux, el escritorio Linux
se considera experimental. La disponibilidad de HEVC y el comportamiento de
ventanas transparentes deben verificarse en el equipo y escritorio utilizados.

Necesita el servicio USB de Apple (iTunes o Dispositivos Apple). Los controladores
no se incluyen en el ejecutable. La ventana transparente permite ajustar el tamaño libremente; los ajustes completos
permanecen disponibles en el panel.

## Compilar el ejecutable

```powershell
.\setup.ps1
.\build-windows.ps1
```

Para desarrollar: `npm ci`, `node node_modules/electron/install.js`, `npm run build`
y `npm start`. El empaquetado queda en `../Mirros-Windows` e incluye el backend
autónomo construido con `desktop/backend.spec`. El proyecto conserva el lanzador
Python de Windows/Linux descrito a continuación.

## Lanzador Python de Windows y Linux

Visualiza y controla la pantalla de tu iPhone por USB. El programa ejecuta
`pymobiledevice3` y abre el visor en una ventana independiente de Edge, Chrome
o Chromium. En Windows se ejecuta con Python y los controladores de Apple,
sin WSL ni una máquina virtual. La interfaz usa WebCodecs del navegador;
no es una interfaz WinUI.

## Requisitos

- Python 3.10 o posterior.
- iPhone con iOS **17.4 o posterior recomendado** para el túnel USB sin
  privilegios. iOS 17.0–17.3.1 necesita un `tunneld` aparte en Windows/Linux.
- Modo Desarrollador activado en Ajustes > Privacidad y seguridad.
- Cable USB de datos, iPhone desbloqueado y confianza concedida al ordenador.
- Edge, Chrome o Chromium con decodificación HEVC mediante WebCodecs.
  Su disponibilidad depende del navegador, Windows y el hardware.
- En Windows, **Apple Mobile Device Service** instalado y activo. El instalador
  de [iTunes de Apple](https://www.apple.com/itunes/download/win64) proporciona
  este componente; si falta, instala Apple Mobile Device Support de Apple
  con permisos de administrador. Dispositivos Apple también permite USB.
- En Linux, `usbmuxd` instalado y activo.

## Windows

Abre PowerShell en esta carpeta:

```powershell
.\setup.ps1
.\ios-scrcpy.cmd --diagnose
.\ios-scrcpy.cmd
```

Si Python no está en PATH, indica su ruta:

```powershell
.\setup.ps1 -Python 'C:\ruta\python.exe'
```

Si PowerShell impide ejecutar el script, puedes usar Python directamente
sin cambiar la política del sistema:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
.\ios-scrcpy.cmd
```

También puedes hacer doble clic en `ios-scrcpy.cmd` después de la instalación.
El programa espera a que conectes el iPhone, monta automáticamente la imagen
de desarrollo compatible y abre el visor cuando hay video disponible. La primera
preparación puede tardar varios minutos y requiere Internet para descargar la
imagen. Cierra la ventana o pulsa Ctrl+C en la terminal para detenerlo.

## Linux

```bash
chmod +x setup.sh bin/ios-scrcpy
./setup.sh
ios-scrcpy
```

En Arch/CachyOS, instala `usbmuxd` y Chromium e inicia el servicio:

```bash
sudo pacman -S --needed usbmuxd chromium
sudo systemctl enable --now usbmuxd
```

### Escritorio Linux (experimental)

El lanzador de terminal sigue disponible. Para usar la misma interfaz React:

```bash
./setup.sh
npm ci
node node_modules/electron/install.js
npm run build
npm start
```

Para compilar un AppImage x64: `./build-linux.sh`. Se genera en
`../Mirros-Linux`. Necesita Node.js 22.12+ y las bibliotecas de escritorio que
requiere Electron. La compilación y la prueba con iPhone en Linux están pendientes;
no se presenta como paridad ya validada con Windows.

## Opciones

| Opción | Uso |
| --- | --- |
| `--diagnose` | Comprueba Python, backend, navegador y dispositivos USB. |
| `-p, --port PUERTO` | Puerto local; automáticamente elige uno libre desde 8080 si se omite. |
| `-u, --udid UDID` | Selecciona un iPhone; obligatorio si hay varios conectados. |
| `-b, --browser RUTA` | Ruta a un navegador Chromium alternativo. |
| `--audio` | Activa el sonido inicialmente en el visor. |
| `--no-audio` | No activa el sonido inicialmente; es el valor por defecto. |
| `--no-userspace` | Usa un `tunneld` existente para el dispositivo seleccionado. |

El backend escucha únicamente en `127.0.0.1`. El registro de cada ejecución
se guarda en el directorio temporal de Windows/Linux y su ruta aparece en la
terminal. Los errores del backend devuelven un código distinto de cero.

El visor indica al decodificador de Windows las dimensiones HEVC del iPhone
para evitar que Edge recorte una pantalla vertical al tamaño predeterminado
1280 × 720. La corrección está incluida en el proyecto y se conserva al reinstalarlo.

## Uso del visor

Clic para tocar, arrastra para deslizar y usa los controles visibles del visor
para Inicio, volumen y bloqueo. El visor del backend ofrece también teclado,
rotación, zoom y portapapeles. El soporte concreto depende del iPhone y de iOS.

## Diagnóstico

- **No hay dispositivos:** verifica el cable, desbloquea el iPhone y acepta
  «Confiar». En Windows, comprueba que Apple Mobile Device Service esté activo.
- **No inicia la transmisión:** verifica Modo Desarrollador y lee el registro.
  Cierra Cámara o cualquier app que esté usando cámara/micrófono antes de iniciar.
- **Pantalla negra o fallo de decodificación:** consulta el estado HEVC en el
  visor y prueba Edge/Chrome actualizado con soporte HEVC en Windows.
- **iOS 17.0–17.3.1:** inicia `python -m pymobiledevice3 remote tunneld` con los
  privilegios necesarios y luego ejecuta `ios-scrcpy --no-userspace`.

Documentación oficial del backend:
[instalación](https://github.com/doronz88/pymobiledevice3/blob/master/docs/installation.md),
[túneles de iOS](https://github.com/doronz88/pymobiledevice3/blob/master/docs/guides/ios17-tunnels.md),
[transmisión](https://github.com/doronz88/pymobiledevice3/blob/master/docs/guides/cli-recipes.md).

## Desarrollo y pruebas

La versión del backend queda fijada en `pyproject.toml`. Para comprobar el
transporte, el arranque HTTP y la gestión de procesos sin un teléfono:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
npm test
```

El flujo de CI contempla Windows y Linux con Python 3.10/3.12. Estas pruebas
no sustituyen comprobar imagen, audio y entrada con un iPhone físico.
