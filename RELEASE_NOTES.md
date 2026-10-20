# Mirros 1.1.5

Pantalla, audio y control del iPhone por USB en Windows y Linux.

## Descargas

- **Windows x64:** `Mirros-1.1.5-Windows.exe`. Portátil: descarga y abre el EXE.
- **Linux x64:** `Mirros-1.1.5-Linux-x64.AppImage`. Descarga, da permiso de ejecución y abre el AppImage.
- **Código fuente:** `Mirros-1.1.5-Source.zip`, generado desde la misma etiqueta.
- **Verificación:** `SHA256SUMS.txt` contiene los hashes SHA-256 de estos archivos.

Los paquetes incluyen Electron, Python y el backend. No requieren instalar Python ni Node.js.

## Novedades

- **Puntero configurable:** Sustituye el cursor `+` por una flecha, círculo o punto personalizable dentro de la pantalla del iPhone. Elige color y tamaño desde **Ajustes → Apariencia → Ratón**; la precisión táctil se mantiene intacta.
- **Modo AOD / Reposo estilo Mac:** Permite que la pantalla física del iPhone descanse (Always-On Display / StandBy) mientras continúas visualizando y controlando el dispositivo fluidamente desde tu PC.
- **Selector de modo de pantalla física:** Alterna en cualquier momento entre **Pantalla Dual** (ambas pantallas activas) y **Modo AOD / Reposo** desde la pestaña Pantalla o la barra de herramientas.
- **Gesto de despertar y desbloqueo integrado:** Nuevo atajo `Ctrl + U` y botón en pantalla para despertar y desbloquear el iPhone directamente desde el PC.
- **Control WebSocket binario:** Canal persistente de control para tacto y teclado con confirmación por orden tras el despacho HID y respaldo HTTP automático.
- **Diagnósticos privados:** Herramienta de diagnóstico seguro (`mirros --diagnose`) que oculta UDIDs, identificadores y rutas privadas.
- Se conservan las mejoras de optimización, compresión binaria y reducción de asignaciones de 1.1.3.

## Requisitos y límites

- iPhone desbloqueado, cable USB de datos, confianza concedida y Modo Desarrollador.
- iOS 17.4 o posterior para el túnel USB en espacio de usuario.
- Windows: Apple Mobile Device Service mediante Dispositivos Apple o iTunes. Los controladores de Apple no se incluyen.
- Linux: `usbmuxd`; el AppImage puede necesitar FUSE 2 o `APPIMAGE_EXTRACT_AND_RUN=1`. Wayland necesita `wl-clipboard` para compartir el portapapeles entre aplicaciones.
- La primera preparación del iPhone puede necesitar Internet.
- Cámara y micrófono del iPhone no pueden utilizarse durante la duplicación con este transporte. Pulsa **Desconectar de forma segura** y espera a que termine la sesión antes de abrir Cámara.

Los paquetes se construyen de forma nativa y se comprueban en GitHub Actions para Windows y Linux. Las pruebas automáticas no sustituyen la validación física con cada modelo de iPhone y versión de iOS.
