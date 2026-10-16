# Arquitectura

MirrOS tiene dos entradas y un único adaptador del transporte USB:

```text
CLI mirros → runner → procesos → backend → adaptador → pymobiledevice3 → iPhone
Electron main → sesión USB → worker Python → adaptador → pymobiledevice3 → iPhone
              ↕ IPC
           React → proxy HTTP local → backend
```

## Backend Python (`src/mirros`)

- `cli.py`: argumentos, ayuda, versión y códigos de salida.
- `runner.py`: detección, preparación DDI, disponibilidad HTTP y visor del navegador.
- `processes.py`: SIGTERM, procesos propios, cierre HTTP con plazo y terminación de respaldo.
- `device.py`: descubrimiento USB nativo; no requiere `idevice_id` ni elige un teléfono arbitrariamente.
- `backend.py`: entrada ejecutable; `adapter.py`: único punto de configuración de
  los parches de `pymobiledevice3`, validación del contrato y liberación de entrada.
- `video.py` y `audio.py`: códecs y alternativa de decodificación. El streaming por
  software también depende del contrato privado de suscriptores del backend fijado.

El backend está fijado a 11.32.0. El adaptador comprueba versión, métodos y plantilla
antes de modificar clases. Una actualización de esa dependencia exige revisar
además los campos privados de las sesiones, no solo que las importaciones funcionen.

## Escritorio (`desktop`)

`main.cjs` gestiona ventanas, preferencias, IPC y proxy local. `session.cjs` posee
los procesos USB, preparación, escaneo, selección, desconexión y reconexión, sin
importar Electron. `runtime.cjs` aporta rutas portables y terminación por sistema.
`worker.py` es la entrada de Python que PyInstaller incorpora al paquete.

Las ventanas no poseen el transporte. Cambiar entre panel y teléfono flotante
conserva la sesión. Una generación de conexión impide que resultados de consultas
antiguas reinicien una sesión pausada o cerrada. `updates.cjs` verifica y prepara
actualizaciones; `clipboard.cjs` solo transfiere contenido por una acción explícita.

## Interfaz (`frontend/src`)

`main.jsx` monta React; `App.jsx` compone la pantalla. `components` contiene los
controles compartidos. `hooks` separa suscripción al estado, video/orientación,
audio y entrada. `input.js`, `orientation.js`, `video.js` y `audio.js` contienen
la lógica de gestos y medios; `transport.js` concentra las solicitudes de control.

Las teclas sostenidas renuevan su concesión al backend; perder el foco libera la
entrada. Si desaparece la ventana, la concesión vence para evitar teclas atascadas.

## Construcción y publicación

Vite genera `src/mirros/web`; PyInstaller empaqueta Python; electron-builder genera
EXE/AppImage bajo `dist`. `pyproject.toml` gobierna la versión de Python, Electron
y sus artefactos. CI valida manifiestos, pruebas y ambos paquetes del mismo commit.
Solo las etiquetas estables que coinciden con esa versión y pertenecen a `main`
pueden crear una publicación.
