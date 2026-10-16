# Contribuir a MirrOS

Trabaja en una rama y abre un PR contra `main`. Describe el problema, el cambio
observable y cómo lo comprobaste. Mantén separadas las correcciones de transporte,
los cambios visuales y las modificaciones de publicación cuando sea posible.

## Preparación

Linux: `./setup.sh`. Windows: `./setup.ps1`.
Después: `npm ci`, `node node_modules/electron/install.js`, `npm run build`.
`npm start` abre el escritorio; `mirros` abre el visor del backend en un navegador.

## Comprobaciones

```bash
.venv/bin/python -m pip check
.venv/bin/python -m unittest discover -s tests -v
npm test
npm run build
bash -n setup.sh build-linux.sh bin/mirros bin/ios-scrcpy
```

En Windows utiliza `.venv\Scripts\python.exe` en los comandos Python y omite
la comprobación Bash. CI cubre Python 3.10/3.12, Windows y Ubuntu. Las pruebas
usan sockets locales y procesos hijos; necesitan un entorno que los permita.
Las pruebas automáticas no deben depender de un iPhone ni de datos personales.

Prueba los cambios de sesión con la [lista física](docs/COMPATIBILIDAD.md) y anota
sistema, versión de iOS, commit y resultado. No incluyas UDID, nombres personales,
contenido de pantalla ni portapapeles en commits o capturas de pruebas.

## Organización

Consulta [Arquitectura](docs/ARQUITECTURA.md). Usa los módulos de sesión y procesos
para gestionar el backend. Aísla cambios en APIs privadas de `pymobiledevice3` en
el adaptador y añade una regresión. No modifiques sus archivos en `site-packages`.

Los recursos React se generan con Vite en `src/mirros/web` y no se versionan.
Los paquetes, entornos virtuales y dependencias instaladas tampoco se versionan.

## Dependencias y versiones

Usa `npm ci` y conserva `package-lock.json`. La versión del backend se fija en
`pyproject.toml`; actualizarla requiere revisar el contrato del adaptador, las
pruebas de HEVC/HID y el dispositivo físico. No cambies dependencias con
`npm audit fix --force` sin revisar compatibilidad.

Para cambiar la versión, edita solo `pyproject.toml` y ejecuta
`npm run version:sync`; incluye ambos manifiestos Node y el changelog en el PR.
`npm run version:check` valida la sincronización y se ejecuta antes de pruebas
y compilación. La [guía de publicación](docs/ACTUALIZACIONES.md) describe las etiquetas.
