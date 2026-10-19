# Publicación y actualizaciones

GitHub Releases proporciona versiones y archivos. El escritorio consulta el
repositorio oficial al abrir y cada seis horas; también permite hacerlo desde
Ayuda. Descargar e instalar requieren acciones explícitas.

Solo acepta versiones estables posteriores, el paquete x64 esperado, URL HTTPS
del repositorio, tamaño acotado y SHA-256 proporcionado por GitHub. Verifica el
archivo al descargar y de nuevo antes de instalar. El destino es el EXE portátil
original (`PORTABLE_EXECUTABLE_FILE`) o el AppImage (`APPIMAGE`), con permisos de
escritura en el archivo y su directorio.

El instalador espera el cierre, conserva `.mirros-previous` y restaura el archivo
anterior si falla la sustitución. Si la nueva versión arranca pero tiene problemas,
la reversión es manual usando esa copia. El registro se guarda en
`updates/install-update.log` dentro de los datos de la aplicación.

## Publicar

1. Edita la versión `X.Y.Z` en `pyproject.toml` y ejecuta `pnpm run version:sync`.
   Actualiza el changelog y abre el PR.
2. Espera las pruebas Python/JavaScript, compilación React, paquetes y pruebas
   de arranque/cierre de Windows y Linux. Completa la lista física de
   [Compatibilidad](COMPATIBILIDAD.md) y registra los límites pendientes.
3. Integra en `main`. Esto genera artefactos de prueba; **no publica una versión**.
4. Crea y sube explícitamente `vX.Y.Z` sobre el commit validado. El flujo verifica
   que la etiqueta coincide con todos los manifiestos y pertenece al historial de
   `main`, vuelve a probar ese commit y construye ambos paquetes.
5. Solo después de aprobar esos trabajos crea la publicación con EXE, AppImage y
   ZIP del código. Una etiqueta inválida o pruebas fallidas bloquean la publicación.
   Una versión ya publicada no se reemplaza: utiliza otra versión.

Los PR, cambios de rama y ejecuciones manuales producen artefactos de prueba.
El flujo no puede verificar por sí mismo la prueba física: quien crea la etiqueta
es responsable de revisar el registro. No se requieren claves de GitHub en el cliente.
