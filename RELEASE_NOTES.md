# Mirros 1.1.2

Pantalla, audio y control del iPhone por USB en Windows y Linux.

## Descargas

- **Windows x64:** `Mirros-1.1.2-Windows.exe`. Portátil: descarga y abre el EXE.
- **Linux x64:** `Mirros-1.1.2-Linux-x64.AppImage`. Descarga, da permiso de ejecución y abre el AppImage.
- **Código fuente:** `Mirros-1.1.2-Source.zip`, generado desde la misma etiqueta.
- **Verificación:** `SHA256SUMS.txt` contiene los hashes SHA-256 de estos archivos.

Los paquetes incluyen Electron, Python y el backend. No requieren instalar Python ni Node.js.

## Novedades

- Audio continuo con AudioWorklet y reserva adaptable de 120–240 ms.
- Corrección del primer toque al volver desde otra ventana de Windows.
- Toques y teclado ordenados en la misma cola; duración mínima del toque medida en el backend.
- Pausa manual protegida hasta pulsar Reconectar y más tiempo para liberar la sesión al cerrar.
- Cada apertura del portátil Windows utiliza su propia carpeta temporal.
- Mejoras de sesiones USB, portapapeles de texto e imágenes, atajos y compatibilidad Wayland.

## Requisitos y límites

- iPhone desbloqueado, cable USB de datos, confianza concedida y Modo Desarrollador.
- iOS 17.4 o posterior para el túnel USB en espacio de usuario.
- Windows: Apple Mobile Device Service mediante Dispositivos Apple o iTunes. Los controladores de Apple no se incluyen.
- Linux: `usbmuxd`; el AppImage puede necesitar FUSE 2 o `APPIMAGE_EXTRACT_AND_RUN=1`. Wayland necesita `wl-clipboard` para compartir el portapapeles entre aplicaciones.
- La primera preparación del iPhone puede necesitar Internet.
- Cámara y micrófono del iPhone no pueden utilizarse durante la duplicación con este transporte. Pulsa **Desconectar de forma segura** y espera a que termine la sesión antes de abrir Cámara.

Los paquetes se construyen de forma nativa y se comprueban en GitHub Actions para Windows y Linux. Las pruebas automáticas no sustituyen la validación física con cada modelo de iPhone y versión de iOS.
