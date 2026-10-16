# Guía de uso — Mirros 1.1

## Instalar y conectar

En Windows, descarga `Mirros-1.1.0-Windows.exe` de [Releases](https://github.com/Cristiant2608/mirros/releases). Necesita el servicio USB de Apple, incluido en Dispositivos Apple o iTunes. El EXE incluye Python y Electron.

En Linux, descarga `Mirros-1.1.0-Linux-x64.AppImage`, dale permiso de ejecución y ábrelo:

```bash
chmod +x Mirros-1.1.0-Linux-x64.AppImage
./Mirros-1.1.0-Linux-x64.AppImage
```

Instala `usbmuxd` mediante el gestor de paquetes y comprueba que pueda detectar el iPhone. En Ubuntu: `sudo apt install usbmuxd`; en Arch: `sudo pacman -S usbmuxd`. Para AppImage puede hacer falta FUSE 2 (`libfuse2` en Ubuntu 22.04 o `libfuse2t64` en 24.04). Si FUSE no está disponible, prueba `APPIMAGE_EXTRACT_AND_RUN=1 ./Mirros-1.1.0-Linux-x64.AppImage`.

Guarda el ejecutable en una carpeta donde tu usuario tenga permiso de escritura para poder actualizarlo.

1. Conecta un cable USB de datos.
2. Desbloquea el iPhone y acepta «Confiar en este ordenador».
3. Activa Modo Desarrollador en Ajustes → Privacidad y seguridad.
4. Mantén el cable conectado durante la preparación inicial. Puede descargarse la imagen de desarrollo compatible.

Se recomienda iOS 17.4 o posterior para el túnel USB sin privilegios. El lanzador de terminal admite un `tunneld` externo para versiones anteriores; consulta el README.

## Pantalla y controles

![Pantalla de ejemplo de Mirros](screenshots/pantalla.png)

Todas las capturas de esta guía muestran una pantalla generada: no contienen datos ni imágenes de un iPhone real.

Clic para tocar, arrastrar para deslizar y rueda para desplazar. La rueda horizontal también se admite. El clic derecho vuelve a Inicio. Haz clic en el visor para enviar el teclado del PC; al salir del visor se libera la entrada.

La barra vertical queda fuera del teléfono. Su pestaña la guarda bajo la vista y vuelve a desplegarla. La X termina Mirros de forma segura; las flechas envían deslizamientos, porque iOS no ofrece un botón global Atrás como Android.

![Teléfono flotante con controles](screenshots/telefono-flotante.png)

![Controles guardados bajo el teléfono](screenshots/telefono-guardado.png)

El icono de monitor vuelve al panel. Arrastra el asa al final de la barra para mover la ventana flotante. Los bordes y esquinas cambian el tamaño del teléfono; los iconos conservan su tamaño. El botón de expandir usa el alto útil del monitor. La chincheta activa «Siempre encima».

«Girar vista 90°» adapta la imagen, la ventana y los toques. También se pide el giro a iOS, pero una aplicación puede permanecer vertical. En ese caso, Mirros lo indica. Los cambios de orientación que comunica la interfaz de iOS se siguen automáticamente.

## Audio

![Ajustes de audio](screenshots/audio.png)

«Reproducir audio en el PC» y su volumen afectan al computador. Los botones del iPhone envían sus propias órdenes de volumen y silencio. Para escuchar solo en el iPhone, desactiva el audio del PC. El botón Silencio de iOS puede no silenciar contenido multimedia; no garantiza escuchar únicamente en el PC.

## Portapapeles

![Transferencias de portapapeles](screenshots/portapapeles.png)

Copia texto o una imagen y pulsa «PC → iPhone» o «iPhone → PC». Después pega en la aplicación de destino. Las transferencias son manuales; no se lee el portapapeles en segundo plano. «Enviar texto» pega en el campo seleccionado en el teléfono.

## Apariencia

![Temas y sensibilidad](screenshots/apariencia.png)

Elige Claro, Oscuro, Lavanda, Océano o el tema del sistema. La elección se conserva y se aplica a la barra flotante. Ajusta los tamaños predefinidos y la sensibilidad de la rueda desde Apariencia.

## Terminar sin dejar el teclado conectado

Usa «Desconectar de forma segura» antes de retirar el cable y espera «Sesión terminada». Cerrar Mirros solicita la misma limpieza. Para empezar otra sesión, pulsa Reconectar.

Si quitaste el cable antes, el ordenador ya no puede garantizar que el iPhone reciba la liberación. La aplicación deja de registrar teclados por solicitudes vacías, libera la entrada al perder el foco y cierra el teclado tras cinco segundos de inactividad. La recuperación del teclado de iOS después de una desconexión brusca necesita comprobarse en el dispositivo.

## Actualizar

![Comprobación de actualizaciones](screenshots/actualizaciones.png)

Ayuda → Buscar actualizaciones consulta el repositorio oficial. Cuando hay una publicación nueva para tu sistema, pulsa Descargar y después Reiniciar y actualizar. Mirros comprueba tamaño y SHA-256, termina la sesión y conserva una copia del ejecutable anterior con extensión `.mirros-previous`.

Una modificación en `main` necesita un paquete publicado para actualizar un EXE o AppImage. El flujo de publicación lo genera después de aprobar las comprobaciones de ambas plataformas y aumentar la versión. No se instala código de una rama de trabajo sobre un ejecutable.

## Atajos sobre el visor

| Acción | Atajo |
| --- | --- |
| Inicio | Ctrl+H o clic derecho |
| Bloquear iPhone | Ctrl+L |
| Guardar captura | Ctrl+P |
| Volumen del iPhone | Ctrl+[ y Ctrl+] |
| Siri | Ctrl+S |

## Si no aparece imagen

Comprueba cable, confianza, Modo Desarrollador y servicio USB. Cierra Cámara o aplicaciones que estén usando cámara/micrófono y pulsa Reconectar. Ayuda permite abrir el registro de conexión.

Si el navegador no puede decodificar HEVC, el escritorio usa decodificación por software. Esto consume más CPU y puede reducir los fotogramas por segundo. En Linux, comprueba además el compositor: las restricciones de Wayland pueden afectar a transparencia o a mantener ventanas encima; probar X11 permite distinguir un problema del escritorio de uno del transporte USB.
