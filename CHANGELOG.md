# 1.1.2 — 2026-10-16 (integración local)

- Ordena toques y liberación del teclado al recuperar el foco de la ventana.
- Conserva la duración del primer toque tras reabrir el canal HID del iPhone.
- Evita reconectar una sesión pausada por un resultado USB atrasado.
- Da hasta 30 segundos a la limpieza del backend antes de forzar su cierre.
- La cámara y el micrófono requieren detener la duplicación; el transporte CoreDevice no admite su uso simultáneo.

# 1.1.1 — 2026-10-16 (integración local, pendiente de publicación)

- Mantiene el audio PCM en una cola AudioWorklet con reserva adaptable de 120–240 ms.
- Evita fragmentos superpuestos, recupera la conexión de audio y reduce actualizaciones de interfaz.
- Aísla los archivos temporales de cada apertura del portátil y restaura la ventana existente.
- Muestra el inicio y elimina la compresión interna del EXE para reducir demoras.


- Corrige rutas de portapapeles tras teclas en conexiones persistentes.
- Comparte portapapeles entre aplicaciones Wayland mediante wl-clipboard.
- Envía Command antes de C/V y admite repetir la copia de la misma selección.
- Evita pruebas duplicadas de CI y documenta los límites de pantalla apagada.

- Integra Ctrl+C/Ctrl+V sobre el iPhone y resuelve imágenes de contenido enriquecido de iOS.

- Corrige portapapeles para la API asíncrona de Electron y añade una prueba nativa.
- Reinicia sesiones con túnel cerrado tras reconectar el mismo teléfono.
- Elimina los avisos de npm audit conservando el empaquetador y valida proxy en CI.

- Integra el PR #1 conservando el paquete y comando `mirros`; mantiene el alias `ios-scrcpy`.
- Separa sesión USB de las ventanas Electron y conexión/video/audio/entrada de React.
- Aísla y comprueba el contrato del backend; corrige SIGTERM y liberación de procesos.
- Renueva la concesión de teclado mientras se mantiene una tecla pulsada.
- Instala y comprueba dependencias al reutilizar un entorno virtual.
- Centraliza la versión en pyproject.toml; publica solo mediante etiquetas verificadas.
- Añade pruebas de señales, fallos de arranque, instalación repetida, sesiones y versiones.

# Historial de cambios

## 1.1.0 — 2026-10-15

Esta versión amplía el proyecto original de Linux con una aplicación de escritorio compartida entre Windows y Linux.

### Windows y transporte USB

- Detección mediante `pymobiledevice3`, sin depender de `idevice_id`, WSL ni una máquina virtual.
- Soporte del servicio USB de Apple en Windows y del socket `usbmuxd` en Linux.
- Entorno Python instalable, dependencias fijadas y lanzadores nativos PowerShell/CMD.
- Preparación automática de la imagen de desarrollo del iPhone antes de iniciar la transmisión.
- Comprobación de video disponible mediante `/codec`; responder HTML ya no basta para considerar listo el servidor.
- Selección de dispositivos, puertos libres, diagnóstico y registros de conexión.
- Cierre de procesos hijo según el sistema, sin aplicar comandos Windows en Linux.
- Recuperación ante fallos temporales de detección USB y protección frente a respuestas antiguas de una conexión anterior.

### Video y orientación

- Lectura de dimensiones HEVC desde SPS/hvcC para mostrar completa la imagen vertical; corrige el recorte a 1280×720.
- Cola de video acotada, recuperación de fotogramas clave y conservación de la última imagen cuando el teléfono está quieto.
- Decodificación por software con PyAV cuando Chromium no dispone de HEVC; mantiene video, entrada y orientación también sin un decodificador HEVC del navegador.
- Giro de la vista en pasos de 90°, ajuste de la ventana flotante y transformación de las coordenadas de entrada.
- Consulta de orientación de la interfaz de iOS. Se distingue girar la vista de conseguir que iOS gire una aplicación que permanece vertical.

### Interfaz

- Escritorio React/Electron en español con secciones Pantalla, Audio, Portapapeles, Apariencia y Ayuda.
- Temas Claro, Oscuro, Lavanda y Océano; seguimiento del tema del sistema.
- Teléfono flotante transparente, redondeado y con opción de mantenerlo siempre encima.
- Barra vertical fuera del teléfono, con pestaña animada para guardarla bajo la vista y desplegarla.
- Controles ordenados: salida, deslizamientos, Inicio, giro, ventana, audio, captura y portapapeles.
- Redimensionado desde bordes y esquinas: cambia el teléfono sin escalar los botones. Ajuste al alto útil del monitor y tamaños predefinidos.
- Capturas PNG, navegación accesible y preferencias conservadas entre sesiones.
- Capturas del repositorio generadas con una pantalla simulada, sin imágenes ni datos del teléfono de una persona.

### Control, teclado y salida segura

- Preparación de HID antes del primer toque para reducir la demora inicial.
- Coordenadas normalizadas, umbral para pequeños movimientos accidentales y agrupación de movimientos pendientes.
- Conservación del último punto al soltar; los gestos no dejan un dedo activo al perder el foco.
- Rueda proporcional, desplazamiento horizontal y ajuste de sensibilidad.
- Un clic interrumpe el desplazamiento pendiente sin acumular una cola de gestos antiguos.
- Una lista vacía de teclas ya no registra un teclado externo que pueda ocultar el teclado del iPhone.
- Liberación al perder el foco, cierre del teclado por inactividad y acción «Desconectar de forma segura».
- El cierre solicita la limpieza del servidor y espera antes de recurrir a la terminación del proceso. Después de retirar USB no se garantiza que el iPhone pueda recibir nuevas órdenes de limpieza.

### Audio y portapapeles

- Decodificación AAC-ELD de 480 muestras con PyAV/FFmpeg en Windows y Linux.
- Interruptor y volumen de reproducción del PC independientes de los botones de volumen y silencio del iPhone.
- Transferencia manual de texto Unicode y PNG en ambos sentidos, con límites de tamaño y sin lectura automática del portapapeles.
- Conservación del portapapeles del PC si la lectura del dispositivo falla.

### Distribución, actualizaciones y pruebas

- EXE portátil para Windows x64 y AppImage para Linux x64; ambos incluyen su runtime Python.
- Comprobación automática de versiones publicadas en el repositorio oficial de GitHub y consulta manual desde Ayuda.
- Selección del paquete de cada plataforma, descarga con límite de tamaño y verificación SHA-256 antes de instalar.
- Instalación al reiniciar, cierre seguro previo y conservación del ejecutable anterior.
- Flujo de CI para Python 3.10/3.12, Windows/Ubuntu, React, gestos, audio, portapapeles y actualizaciones.
- Empaquetado y arranque del escritorio con pantalla virtual de CI en Linux; los checks sin USB no sustituyen probar un iPhone físico.
- Guías de uso, publicación y compatibilidad; referencias de diseño y licencias.

### Límites conocidos

- No se apaga únicamente el panel físico del iPhone y no se crea una pantalla virtual independiente como `scrcpy --new-display`.
- «Silencio» depende de iOS y puede no silenciar música o videos; no se anuncia un modo «solo PC» garantizado.
- La transparencia y «Siempre encima» dependen del compositor en Linux, especialmente en Wayland.
- La paridad del código y las pruebas de CI no equivalen a una prueba física completa de USB, audio y entrada en cada distribución.

## 1.0.0 — versión original

- Lanzador Linux para visualizar y controlar el iPhone mediante `pymobiledevice3` y un navegador compatible.
- Configurador para el entorno Python y acceso desde la terminal.
