# Revisión e integración del PR #1

Revisión del 16 de octubre de 2026. Origen: [PR #1](https://github.com/Cristiant2608/mirros/pull/1),
commit `e411e8743f103f70c513352ace7c1630f6eeb86c`; rama principal local
`bb486db9cdf49044250558318aa9b7eb7f569062`.

## Resultado

Se incorpora el trabajo de escritorio React/Electron, Windows/Linux, códecs,
controles y actualizaciones del colaborador, conservando `mirros` como paquete y
comando principal. `ios-scrcpy` permanece como alias. Esta integración es local:
no aprueba ni fusiona el PR en GitHub y no publica una versión.

## Hallazgos corregidos

| Prioridad | Hallazgo | Corrección |
| --- | --- | --- |
| Bloqueante | El PR parte de antes del cambio de nombre y entra en conflicto con `main`. | Unifica imports, recursos, pruebas, entradas y empaquetado bajo `mirros`. |
| Alta | En `main`, `cleanup()` sale siempre con 0, ocultando fallos del servidor. | Conserva los retornos de error del PR y añade regresiones de arranque fallido. |
| Alta | La CLI del PR pierde el manejo de SIGTERM y puede dejar el backend vivo. | Desenrolla la pila, solicita `/session/end`, termina procesos propios y devuelve 143. Prueba con procesos reales. |
| Media | El instalador original omite dependencias si ya existe `.venv`. | Conserva la reparación del PR, comprueba intérprete y `pip check`; prueba dos instalaciones sucesivas. |
| Media | Una tecla sostenida más de cinco segundos pierde su concesión al backend. | Renueva la concesión mientras hay teclas sostenidas; cancela la concesión anterior al liberar entrada. |
| Media | Publicación automática al integrar una versión en `main`. | Solo publica por etiqueta estable validada, tras pruebas y ambos paquetes del mismo commit. |
| Mantenimiento | Adaptaciones a métodos privados mezcladas con la entrada del backend. | Aísla el adaptador y valida versión, métodos y plantilla antes de aplicar parches. |
| Mantenimiento | Ventanas, transporte y recursos visuales concentrados en entradas grandes. | Extrae sesión USB, componentes y hooks de conexión, video, audio y entrada. |
| Media | La prueba de paquetes usaba un puerto fijo y podía dejar procesos al fallar. | Puerto libre, plazos de conexión, liberación de sesión y limpieza del árbol de procesos de prueba. |
| Mantenimiento | Versión repetida en Python, Electron y manifiestos. | `pyproject.toml` como fuente, sincronizador y comprobación previa en CI. |

## Evidencia y límites

- La suite original del PR pasó localmente: 22 pruebas Python (una exclusiva de Windows omitida) y 44 JavaScript.
- Con las regresiones añadidas: 32 pruebas Python (una exclusiva de Windows omitida) y 49 JavaScript, sin fallos.
- AppImage construido localmente y verificado: panel, ventana flotante, retorno al panel, pausa durante un ciclo de escaneo y cierre seguro.
- Instalación editable, `pip check`, ayuda del backend, CLI y alias, compilación React y sintaxis Bash comprobadas.
- Con iPhone real en Linux se comprobó preparación DDI, conexión USB, video de 1184 × 2576 y lectura de 60 fps del visor. El usuario confirmó imagen, clic y arrastre, teclado sostenido y audio. La desconexión segura dejó la sesión pausada y el backend confirmó su cierre.
- Los checks Windows/Linux y paquetes del PR original figuraban aprobados al revisarlo. Los cambios de esta rama necesitan su propia ejecución de CI en GitHub; no se consideran certificados por los checks anteriores.
- Seguimiento: se eliminó la cadena vulnerable de `sprintf-js` mediante un override de `global-agent` 4.1.3 limitado a `@electron/get`, conservando electron-builder. `npm audit` no reporta vulnerabilidades. Una prueba con proxy HTTP local comprueba el bootstrap usado por el empaquetador.
- La prueba física posterior detectó API de portapapeles antigua y una sesión congelada al reconectar. Se migró a ClipboardItem y operaciones asíncronas de Electron, con prueba nativa de texto/PNG en ambos sentidos. El endpoint `/health` detecta túneles cerrados y falta prolongada de fotogramas; el escritorio crea una sesión nueva aunque reaparezca el mismo UDID.

Las pruebas físicas de portapapeles, teclado después de retirar el cable y comportamiento
con otros compositores/distribuciones deben registrarse antes de publicar. No se
certifica latencia de extremo a extremo a partir del contador de fotogramas.
