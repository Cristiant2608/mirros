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
