# Compatibilidad y validación

Windows y Linux usan la misma interfaz React y los mismos módulos de entrada, audio, portapapeles, orientación y actualización. Solo cambian las rutas de Python, la gestión de procesos, los servicios USB y la sustitución del ejecutable.

| Función | Windows x64 | Linux x64 |
| --- | --- | --- |
| Interfaz, temas y pestaña de controles | Compartida; revisada localmente | Compartida; React y pruebas aprobados en Ubuntu |
| Video HEVC | WebCodecs y alternativa PyAV | WebCodecs si está disponible; alternativa PyAV |
| Decodificación por software | Probada con HEVC real generado | Misma prueba en Ubuntu |
| Toques, rueda y teclado | Pruebas de orden, precisión y liberación | Mismas pruebas, más cierre POSIX de descendientes |
| Audio AAC-ELD | PyAV; sonido comprobado con iPhone | PyAV; configuración y sonido confirmados en Linux |
| Portapapeles texto/PNG | Pruebas automatizadas; nueva transferencia física pendiente | Mismo código y pruebas; transferencia física pendiente |
| Ventana flotante, transparencia y siempre encima | Ventana nativa Electron | Ventana Electron; depende del compositor, especialmente Wayland |
| Actualizaciones | EXE portátil original | AppImage original |
| Salida segura | Liberación y cierre del servidor probados | Mismas pruebas y gestión POSIX |

## Qué comprueba CI

`Windows and Linux checks` instala el proyecto, comprueba dependencias y ejecuta pruebas con Python 3.10 y 3.12 en Windows y Ubuntu. También compila React y ejecuta las pruebas JavaScript de gestos, coordenadas HEVC, portapapeles, cierre de procesos y actualizaciones.

`Desktop packages` construye de forma nativa el EXE y AppImage, abre el backend empaquetado y comprueba que el escritorio renderiza el visor, pausa la sesión sin reconectarse y se cierra. Linux usa Xvfb para proporcionar una pantalla al runner. Los resultados de la revisión concreta se consultan en los checks del PR; un artefacto generado sin aprobar el arranque no se considera validado.

## Qué queda fuera de CI

Los runners no tienen conectado un iPhone. No pueden certificar imagen, audio, confianza, DDI, portapapeles, respuesta táctil, latencia ni recuperación del teclado de iOS en un dispositivo físico. El autor del PR informó pruebas de imagen, audio, desplazamiento y orientación en Windows. En esta integración, el usuario confirmó imagen, clic/arrastre, teclado sostenido y audio en Linux; la orientación física y el resto de versiones y sistemas requieren validaciones separadas.

El usuario confirmó recuperación de imagen y teclado tras retirar y volver a conectar el cable en Linux. Las transferencias nuevas de texto/PNG siguen pendientes de validación física completa. La salida segura debe usarse antes de quitar USB para permitir que el teléfono reciba la limpieza.

## Diferencias del entorno

- Windows requiere Apple Mobile Device Service; Linux requiere `usbmuxd`.
- La decodificación por software evita depender de HEVC en Chromium, a costa de más CPU y un máximo de 30 imágenes JPEG por segundo, con escalado completo hasta 1568 píxeles en el lado mayor. No recorta el teléfono.
- Transparencia, colocación y «Siempre encima» pueden variar en Wayland. X11 permite comparar el comportamiento sin cambiar el transporte USB.
- El AppImage se construye en Ubuntu 22.04. Otras distribuciones deben cumplir las dependencias de Electron y la compatibilidad de glibc.
- Se distribuye x64. No se han preparado paquetes ARM ni se anuncia soporte de escritorio macOS.
- No se implementa una pantalla virtual independiente ni apagar únicamente el panel del iPhone; el silencio multimedia y la orientación de las apps dependen de iOS.

## Registro de esta integración — 2026-10-16

Entorno local: CachyOS/Linux x64, Python 3.14.8, Node.js 26.11.1 e iPhone con
iOS 27.0.1. Corresponde a la integración en `improve/project-foundation`; el
commit que incorpora este registro identifica la revisión de código. Esto no
amplía por sí mismo la matriz de compatibilidad de todas las versiones de iOS.

- [x] Detección USB y preparación DDI.
- [x] Imagen completa de 1184 × 2576; el visor registró 60 fps (no es una medición de latencia).
- [x] Usuario confirma clic y arrastre, teclado sostenido y audio en el PC.
- [x] Desconexión segura: estado pausado y cierre confirmado por el backend.
- [ ] Transferencias reales de texto y PNG en ambos sentidos.
- [x] Usuario confirma recuperación de imagen y teclado después de retirar y volver a conectar el cable.
- [ ] Orientación física y controles sobre aplicaciones horizontales/verticales.
- [ ] Repetir la prueba física en Windows con esta integración.

Antes de publicar, completa los pendientes relevantes y anota resultado, sistema,
iOS y commit. Usa un campo de texto y contenido de prueba; no adjuntes datos
personales del teléfono. La compilación Windows y la compatibilidad de glibc del
AppImage de publicación se validan mediante CI en sus plataformas nativas.
