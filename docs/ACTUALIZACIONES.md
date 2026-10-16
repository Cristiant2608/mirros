# Publicación y actualizaciones

GitHub Releases actúa como servidor de versiones y archivos. No hace falta desplegar ni mantener otro servicio.

El cliente consulta `Cristiant2608/mirros/releases/latest` al abrir y cada seis horas. Ayuda permite consultar manualmente. Solo acepta versiones estables mayores que la instalada, un paquete con el nombre esperado para el sistema y arquitectura, URL del repositorio oficial, tamaño razonable y digest SHA-256 de la API de GitHub.

La descarga se verifica antes de habilitar «Reiniciar y actualizar». La instalación corresponde al EXE portátil original indicado por `PORTABLE_EXECUTABLE_FILE` o al AppImage indicado por `APPIMAGE`. Una copia extraída para desarrollo no se sobrescribe. El usuario necesita permiso de escritura en el archivo y su carpeta.

El instalador espera que Mirros cierre su sesión. Conserva `.mirros-previous` y restaura el archivo anterior si falla la sustitución. El registro del instalador está en `updates/install-update.log` dentro de los datos de la aplicación. La copia anterior también permite volver manualmente a la versión previa si la nueva inicia pero presenta un problema.

## Publicar una versión

1. Actualiza la versión de `package.json`, `package-lock.json`, `pyproject.toml` y `src/ios_scrcpy/__init__.py`, junto al historial de cambios y los textos de versión de la interfaz.
2. Abre un PR y espera las comprobaciones Windows/Linux y los paquetes. Revisa los límites de pruebas físicas en `COMPATIBILIDAD.md`.
3. Al integrar el PR en `main`, `Desktop packages` construye EXE y AppImage, ejecuta pruebas y comprueba el arranque y cierre de la interfaz.
4. Si ambas plataformas aprobaron y la versión no está publicada, el trabajo de publicación crea `v<versión>` con los binarios y un ZIP del código fuente. Si ya existe, no lo modifica: incrementa la versión para la siguiente actualización.

Las ramas y los PR producen artefactos de prueba; no crean una publicación que los usuarios instalen. Un fallo de empaquetado o arranque bloquea la publicación. La rama principal no se actualiza desde la aplicación de escritorio: se instala una publicación compilada que procede de ella.

El sistema admite Windows y Linux x64. No descarga instaladores de terceros ni necesita claves de GitHub dentro de la aplicación.
