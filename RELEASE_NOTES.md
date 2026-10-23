# Mirros 1.2.0

Pantalla, audio y control del iPhone por USB en Windows y Linux.

## Descargas

- **Windows x64:** `Mirros-1.2.0-Windows.exe`. Portátil: descarga y abre el EXE.
- **Linux x64:** `Mirros-1.2.0-Linux-x64.AppImage`. Descarga, da permiso de ejecución y abre el AppImage.
- **Código fuente:** `Mirros-1.2.0-Source.zip`, generado desde la misma etiqueta.
- **Verificación:** `SHA256SUMS.txt` contiene los hashes SHA-256 de estos archivos.

Los paquetes incluyen Electron, Python y el backend. No requieren instalar Python ni Node.js.

## Novedades

- **Motor Híbrido de Cámara en Directo:** Supera la restricción de pantalla negra de Apple (`AVCaptureVideoPreviewLayer`) mediante el bypass de diagnóstico DVT Instruments (`GET /camera-frame`), proyectando el visor del lente en vivo en el canvas de MirrOS en tiempo real sin desconectar la sesión.
- **Control Táctil Completo en Cámara:** Ahora puedes interactuar directamente con los controles nativos de la cámara desde el PC (obturador en pantalla, niveles de zoom `0.5x`/`1x`/`2x`, alternancia frontal/trasera, enfoque táctil y dial de modos) con despacho directo al digitalizador HID.
- **Aislamiento de Micrófono sin Error 9022:** Gestiona automáticamente la observación remota cuando apps como Cámara, Notas de Voz, WhatsApp, FaceTime o Instagram activan el micrófono o la cámara, otorgando prioridad exclusiva al hardware de iOS sin desconectar la sesión ni arrojar CoreDevice 9022.
- **Sincronización Reactiva a 400 ms:** Transición ultrafluida entre la decodificación HEVC a 60 FPS y el visor de cámara en vivo, con reanudación automática en cuanto se cierra la app del sensor.
- **Disparador de Hardware Remoto:** Endpoint `POST /camera-shutter` y botón flotante opcional para accionar el obturador simulando la tecla de volumen por `IndigoHIDService`.
- **Preflight USB y Revelado AMFI:** Revela automáticamente la opción de Modo Desarrollador en la interfaz de iOS cuando está oculta y selecciona el modo de túnel adecuado (`--userspace` vs `--tunnel`).
- **Selector de aplicaciones / Multitarea (App Switcher):** Abre las aplicaciones abiertas en segundo plano directamente desde el botón de la barra superior, el panel de controles flotante, la pestaña Dispositivo, los atajos `Ctrl + M` / `Ctrl + Tab` o por terminal con `mirros --app-switcher`.
- **Visor de aplicaciones instaladas:** Consulta y filtra las aplicaciones instaladas en el iPhone desde la pestaña Dispositivo o en la terminal con `mirros --list-apps`.
- **Perfiles de video por software e indicador de motor:** Selecciona entre calidad Equilibrada, Económica o Detalle para la decodificación por software (`--force-software`, `--video-quality {economy,balanced,detail}`) y visualiza el motor activo (`HEVC Nativo` o `Software MJPEG`) en la cabecera del visor.

## Funciones conservadas

- **Gestos de borde y pulsaciones largas:** Conserva la duración de pulsaciones sostenidas, el recorrido de arrastres bajo latencia e inicia gestos de sistema desde los primeros 8 píxeles del borde.
- **Puntero configurable:** Sustituye el cursor `+` por una flecha, círculo o punto personalizable dentro de la pantalla del iPhone. Elige color y tamaño desde **Ajustes → Apariencia → Ratón**; la precisión táctil se mantiene intacta.
- **Modo AOD / Reposo estilo Mac:** Permite que la pantalla física del iPhone descanse (Always-On Display / StandBy) mientras continúas visualizando y controlando el dispositivo fluidamente desde tu PC.
- **Selector de modo de pantalla física:** Alterna en cualquier momento entre **Pantalla Dual** (ambas pantallas activas) y **Modo AOD / Reposo** desde la pestaña Pantalla o la barra de herramientas.
- **Gesto de despertar y desbloqueo integrado:** Atajo `Ctrl + U` y botón en pantalla para despertar y desbloquear el iPhone directamente desde el PC.
- **Control WebSocket binario:** Canal persistente de control para tacto y teclado con confirmación por orden tras el despacho HID y respaldo HTTP automático.
- **Diagnósticos privados:** Herramienta de diagnóstico seguro (`mirros --diagnose`) que oculta UDIDs, identificadores y rutas privadas.

## Requisitos y compatibilidad

- iPhone desbloqueado, cable USB de datos, confianza concedida y Modo Desarrollador.
- iOS 17.4 o posterior para el túnel USB en espacio de usuario.
- Windows: Apple Mobile Device Service mediante Dispositivos Apple o iTunes. Los controladores de Apple no se incluyen.
- Linux: `usbmuxd`; el AppImage puede necesitar FUSE 2 o `APPIMAGE_EXTRACT_AND_RUN=1`. Wayland necesita `wl-clipboard` para compartir el portapapeles entre aplicaciones.
- La primera preparación del iPhone puede necesitar Internet.
- Durante el uso de cámara y micrófono, MirrOS activa automáticamente el visor híbrido para permitir el uso libre del sensor sin interrupciones ni bloqueos de privacidad.

Los paquetes se construyen de forma nativa y se comprueban en GitHub Actions para Windows y Linux. Las pruebas automáticas no sustituyen la validación física con cada modelo de iPhone y versión de iOS.
