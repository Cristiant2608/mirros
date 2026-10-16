# Mirros 1.1.3

Pantalla, audio y control del iPhone por USB en Windows y Linux.

## Descargas

- **Windows x64:** `Mirros-1.1.3-Windows.exe`. Portátil: descarga y abre el EXE.
- **Linux x64:** `Mirros-1.1.3-Linux-x64.AppImage`. Descarga, da permiso de ejecución y abre el AppImage.
- **Código fuente:** `Mirros-1.1.3-Source.zip`, generado desde la misma etiqueta.
- **Verificación:** `SHA256SUMS.txt` contiene los hashes SHA-256 de estos archivos.

Los paquetes incluyen Electron, Python y el backend. No requieren instalar Python ni Node.js.

## Novedades

- Ejecutables comprimidos; se conservan español e inglés de Chromium. La apertura del EXE puede tardar más mientras se descomprime.
- Menos copias y asignaciones temporales al recibir vídeo y audio fragmentados.
- Fotogramas tardíos cerrados y lectores de transmisión liberados al desconectar.
- El contador de FPS actualiza solo su propio componente.
- Capturas PNG binarias con diálogo de guardado, sin conversión Base64.
- Backend sin la consola interactiva IPython/Jedi que Mirros no utiliza.
- Se mantienen diseño, resolución, FPS, aceleración gráfica y reserva de audio, así como las correcciones de conexión y toques de 1.1.2.

La compresión reduce la descarga; no implica el mismo porcentaje de ahorro de RAM.
Los resultados reproducibles y sus límites están en `docs/OPTIMIZACION.md`.

## Requisitos y límites

- iPhone desbloqueado, cable USB de datos, confianza concedida y Modo Desarrollador.
- iOS 17.4 o posterior para el túnel USB en espacio de usuario.
- Windows: Apple Mobile Device Service mediante Dispositivos Apple o iTunes. Los controladores de Apple no se incluyen.
- Linux: `usbmuxd`; el AppImage puede necesitar FUSE 2 o `APPIMAGE_EXTRACT_AND_RUN=1`. Wayland necesita `wl-clipboard` para compartir el portapapeles entre aplicaciones.
- La primera preparación del iPhone puede necesitar Internet.
- Cámara y micrófono del iPhone no pueden utilizarse durante la duplicación con este transporte. Pulsa **Desconectar de forma segura** y espera a que termine la sesión antes de abrir Cámara.

Los paquetes se construyen de forma nativa y se comprueban en GitHub Actions para Windows y Linux. Las pruebas automáticas no sustituyen la validación física con cada modelo de iPhone y versión de iOS.
