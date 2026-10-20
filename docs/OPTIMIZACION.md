# Optimización de 1.1.3

## Cambios

El ensamblador lee la cabecera de cuatro bytes y valida la longitud antes de reservar memoria.
Los paquetes contiguos utilizan vistas del fragmento recibido. Los fragmentados reservan
un único bloque por paquete, en lugar de copiar todo el prefijo con cada llegada.
El audio transfiere únicamente el bloque del paquete para no separar los siguientes
datos del mismo fragmento de red.

Se conservan las colas limitadas de vídeo y audio, la resolución, los FPS del transporte,
la aceleración gráfica, el diseño y los temas. El contador de FPS tiene estado propio;
las dimensiones de la vista no se actualizan si el tamaño no cambia. Los fotogramas
que llegan después del cierre se descartan y cierran inmediatamente.

Las capturas pasan de canvas a Blob PNG y luego a IPC binario. El proceso principal
valida firma/tamaño y escribe tras la elección del destino. Cancelar no crea archivos.

## Medición reproducible de asignaciones

Ejecutar `node --expose-gc scripts/benchmark-packets.mjs` desde el repositorio.
La prueba compara el algoritmo anterior y el nuevo con los mismos paquetes y fragmentos,
verifica el contenido recibido y cuenta bytes reservados en buffers de reensamblado.

| Caso | Datos útiles | Asignaciones anteriores | Asignaciones nuevas |
| --- | ---: | ---: | ---: |
| Vídeo: 120 paquetes de 256 KiB, fragmentos de 4 KiB | 30 MiB | 1035 MiB | 30 MiB |
| Audio: 4096 paquetes de 3840 bytes, fragmentos de 512 bytes | 15 MiB | 86,02 MiB | 15 MiB |

Son **asignaciones acumuladas**, no RAM residente simultánea ni consumo total de Mirros.
El tiempo depende del equipo, presión de memoria y calentamiento del motor. No se
debe presentar este porcentaje como mejora de FPS o reducción de RAM total.

## Tamaño y compatibilidad

Se utiliza `compression: normal`, se conserva `portable.useZip: true` y una carpeta
temporal diferente por apertura. El EXE comprimido necesita descomprimirse al abrir.
Se retienen `es`, `es-419`, `en-US` y `en-GB`: unos 45,8 MiB menos de recursos de idiomas
antes de compresión en el runtime Windows examinado. Otros idiomas de los diálogos
internos de Chromium usarán un idioma disponible; la interfaz española de Mirros no cambia.

Se excluyen IPython/Jedi del trabajador empaquetado: Mirros solo expone detección,
preparación y transmisión, no la consola interactiva de investigación. No se eliminan
Pillow, FFmpeg/PyAV, controladores gráficos, Wintun, certificados ni bibliotecas de cifrado.

La limpieza de pruebas y ejemplos del backend anterior solo ahorraba unos 0,07 MiB;
no se realiza una poda indiscriminada. Se mantienen los avisos de licencia.

## Verificación

`pnpm test`, pruebas Python, build Vite, ayuda del trabajador empaquetado, portapapeles
nativo y arranque/cambio de ventanas/cierre de cada paquete en GitHub Actions.
`scripts/capture-ui.mjs` admite `MIRROS_CAPTURE_WEB_ROOT`, `MIRROS_CAPTURE_REPORT` y
`MIRROS_CAPTURE_BROWSER` para comparar la interfaz y heap con contenido simulado.
El ejecutable de Electron puede usarse como navegador de prueba: el auxiliar de
capturas nunca arranca trabajadores USB.

La RAM física total debe compararse con el mismo iPhone, resolución, actividad y duración,
separando memoria privada residente, memoria compartida y memoria comprometida.
Una captura breve o una ventana simulada no demuestra el ahorro de una sesión larga.
