# Revisión de la implementación de reposo — 2026-10-16

Revisión sobre los cambios locales de AOD/reposo, sin fusionarlos ni cambiar
versiones o etiquetas. Los ajustes de esta revisión se dejaron sin preparar
para commit, separados del índice existente.

## Corregido

- `_ensure_hid()` adquiere `_hid_lock` internamente. Llamarlo con el mismo
  candado adquirido bloqueaba reposo y despertar. La inicialización ahora se
  hace antes; una regresión reproduce la adquisición real del candado.
- Se intenta liberar el botón y el contacto táctil también ante fallo o
  cancelación. Si no hay servicio HID, no se informa éxito.
- Reposo no cambia su estado publicado cuando falla la orden de bloqueo.
- Modos inválidos devuelven HTTP 400 y errores del dispositivo HTTP 503.
- Electron comprueba HTTP y el resultado del backend, aplica un plazo y cambia
  la preferencia solo después de aceptar la operación activa. La interfaz
  conserva el error en lugar de sobrescribirlo con un mensaje de éxito.
- Al conectar se avisa si no se pudo aplicar la preferencia de reposo. Se vuelve
  a comprobar la generación tras esa espera para no publicar una sesión obsoleta.
- La prueba de conexión simulada ahora termina el proceso de preparación.
- La interfaz describe el reposo como experimental y no promete desbloqueo ni
  el comportamiento de Duplicación del iPhone de Apple.

## Pendientes antes de anunciar soporte de pantalla apagada

1. **Coordinar salud con reposo intencional.** `session_health()` sigue marcando
   error si no llegan fotogramas durante 20 segundos. `session.scan()` reconstruye
   la sesión en ese caso. El watchdog del motor también vigila la falta de
   fotogramas. Si iOS detiene la captura al bloquear, estos mecanismos pueden
   entrar en conflicto con el reposo solicitado. Hace falta un estado explícito
   de reposo, reglas de recuperación y una indicación visible de imagen detenida.
2. **Coordinar la renovación de energía.** El bucle revisa la preferencia cada
   120 segundos; cambiar a dual no provoca una renovación inmediata. Definir
   cómo notificar cambios al bucle y cómo cerrar sus servicios y concesiones.
3. **Validar con dispositivo físico.** Comprobar bloqueo, despertar, Face ID o
   código, disponibilidad de HID después de dormir y reanudación de video. Los
   tests con mocks no prueban que AOD conserve captura ni interacción.
4. **Acotar las operaciones del backend.** El plazo HTTP del escritorio evita
   que la interfaz espere indefinidamente, pero no cancela por sí mismo una
   operación remota retenida en el servidor. Revisar cancelación y plazos de
   llamadas HID, manteniendo siempre la liberación de entrada.

## Validación de esta revisión

- 50 pruebas Python aprobadas (una exclusiva de Windows omitida).
- 75 pruebas JavaScript aprobadas.
- Compilación React aprobada y `git diff --check` sin errores.
- No se ejecutaron órdenes de reposo sobre el iPhone durante esta revisión,
  para no interferir con la prueba física que se realiza en paralelo.

El PR #3 es independiente: diagnóstico privado y espera de capturas en CI.
Sus checks de Windows/Linux y paquetes finalizaron correctamente.
