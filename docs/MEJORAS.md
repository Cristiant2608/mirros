# Prioridades de mantenimiento

La integración organiza el transporte USB, el escritorio, la entrada y los
códecs en módulos separados. La versión se centraliza en `pyproject.toml` y
`main` se integra mediante PR con pruebas y paquetes obligatorios.

## Antes de publicar el siguiente paquete

- Completar texto y PNG en los dos sentidos con iPhone físico, tanto en Windows
  como Linux. Registrar versión de iOS, commit y aplicación de origen/destino.
- Validar orientación, bloqueo/desbloqueo y reconexión con una tecla pulsada.
  La recuperación de imagen y teclado ya fue confirmada en Linux.
- Aumentar la versión antes de crear la siguiente etiqueta publicada; integrar
  código en main no actualiza por sí solo los ejecutables instalados.

## Próximas mejoras con mayor valor

| Prioridad | Mejora | Criterio de aceptación |
| --- | --- | --- |
| Alta | Diagnóstico exportable con datos sensibles omitidos | Informe sin UDID, nombre del teléfono ni contenido del portapapeles; incluye versiones, estado USB y errores recientes. |
| Alta | Reducir dependencia de métodos privados del backend | Proponer extensiones al motor original; una actualización debe pasar pruebas de contrato, captura, entrada y cierre antes de cambiar la versión fijada. |
| Alta | Firma de paquetes | EXE firmado y verificación de procedencia de artefactos, manteniendo SHA-256 y actualización reversible. |
| Media | Perfiles de calidad de video | Medir CPU y latencia con iPhone real antes de ofrecer ahorro de recursos y máxima calidad. |
| Media | Validación física repetible | Matriz por iOS/sistema y guía breve de entrada, audio, PNG, orientación y reconexión. |
| Investigación | Usar el teléfono con el panel apagado | Requiere un transporte que mantenga captura e interacción con el panel dormido; el motor USB actual no lo ofrece. No anunciar soporte hasta demostrarlo. |

Para reducir la luz del teléfono hoy, bajar manualmente el brillo mantiene el
funcionamiento. No apaga el panel ni crea una pantalla virtual independiente.

## Revisión de propuestas de rendimiento (2026-10-16)

Orden recomendado para cambios independientes, con una línea base antes de
prometer cifras de mejora:

Primer incremento implementado localmente: canal binario `/control` para tacto
y teclado, proxy de Electron, confirmación de despacho, cierre con liberación
y respaldo HTTP al fallar el establecimiento. Pruebas automáticas cubren el
protocolo y el proxy; pendientes la medición con iPhone y el empaquetado de esta
versión. No se anuncia todavía una mejora cuantificada de latencia/FPS.

| Orden | Trabajo | Validación necesaria |
| --- | --- | --- |
| 1 | Medir control HTTP y prototipar un WebSocket persistente | Comparar latencia p50/p95 hasta completar el envío HID, profundidad de cola y reconexión. Conservar el último movimiento pendiente y garantizar liberación de dedos/teclas al cerrar el canal. |
| 2 | Perfiles para el fallback de video | Comparar CPU, RAM, FPS entregados y edad de fotogramas en el mismo equipo y orientación. Separar resolución/FPS locales de bitrate negociable con iOS. |
| 3 | Reducir contrato privado del motor | Inventariar campos y métodos usados también por video/audio; sustituirlos solo cuando exista una API soportada equivalente. Mantener pruebas de captura, entrada y cierre. |
| 4 | Evaluar YUV/WebGL o decodificación acelerada | Comparar copias y ancho de banda local además de CPU. Detectar capacidades y conservar fallback; validar formato, orientación y recuperación de fotogramas clave. |
| 5 | Evaluar otro contenedor de escritorio | Prototipo separado con paridad de HEVC, portapapeles, USB, actualizaciones y paquetes en Linux/Windows. Medir tamaño instalado y RAM total incluyendo Python. |

### Precisiones sobre el código actual

- `transport.js` usa POST JSON, pero una petición no implica abrir una conexión
  TCP nueva: puede reutilizarse. WebSocket reduce sobrecarga; no garantiza
  control a 60–120 Hz ni latencia equivalente a scrcpy.
- `input.js` combina movimientos pendientes para evitar trayectorias atrasadas
  con transporte lento. Esta protección sigue siendo necesaria con WebSocket;
  su cola también puede crecer. Multitáctil requiere comprobar primero que el
  reporte HID y el receptor aceptan varios contactos, no solo dibujar dos puntos.
- `video.py` decodifica HEVC y codifica JPEG en el fallback. YUV/WebGL evita la
  codificación JPEG, pero sigue necesitando decodificar HEVC y transportar los
  planos: 1568 × 720, YUV420 de 8 bits, 60 FPS son aproximadamente 102 MB/s,
  sin contar protocolo ni copias. Es un ejemplo, no la resolución fija actual.
  `h264_vaapi`/`hevc_vaapi` son codificadores; no activan por sí mismos la
  decodificación HEVC acelerada del flujo entrante.
- Ya existe un búfer adaptativo en `frontend/public/audio-worklet.js`: objetivo
  de 120–240 ms y descarte de cola antigua al superar 500 ms. Lo pendiente es
  sincronizar audio/video con marcas de tiempo comunes y medir deriva; añadir
  otro búfer sin coordinarlo puede aumentar la latencia.
- Bajar brillo no equivale a apagar el panel. Una superposición negra del PC no
  oscurece el teléfono; tampoco se ha demostrado una API USB para instalar una
  vista negra de accesibilidad sobre otras apps del iPhone.
- El ahorro de 200–400 MB con Tauri/SDL/PySide es una hipótesis sin medición en
  este proyecto. Cambiar Electron puede afectar la disponibilidad de HEVC.

### Cámara y micrófono: objetivo separado

Optimizar transporte o códecs no elimina la observación remota que restringe
sensores. La investigación está en `INVESTIGACION-CAMARA-REA.md`. Una alternativa
con capturas y WDA por USB exige un runner firmado y probar simultáneamente
imagen, controles, cámara y micrófono; todavía no es una solución validada.

## Diagnóstico exportable disponible

`python -m mirros.diagnostics --output diagnostico-mirros.json` genera un informe
con campos permitidos, sin leer registros ni portapapeles. La consulta USB es
opcional y exporta solo un conteo. La integración de este informe en el botón de
Ayuda del escritorio y los códigos de error recientes siguen pendientes; no se
exportan excepciones sin filtrar. La guía de uso describe alcance y permisos.
