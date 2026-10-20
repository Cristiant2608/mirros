# Política de Seguridad / Security Policy

## Versiones soportadas / Supported Versions

Solo la última versión estable publicada en [GitHub Releases](https://github.com/Cristiant2608/mirros/releases/latest) recibe correcciones de seguridad.

| Versión | Soportada |
| --- | --- |
| `1.1.x` (última versión estable) | ✅ Sí |
| `< 1.1.0` | ❌ No |

---

## Garantías de diseño y privacidad / Security & Privacy Design

1. **Tráfico estrictamente local (`127.0.0.1`):**
   El servidor de transmisión y control de MirrOS escucha únicamente en la interfaz local `127.0.0.1` y nunca expone puertos en la red local (LAN).
2. **Validación de origen en proxy y WebSocket:**
   El proxy interno de Electron y el canal binario `/control` rechazan conexiones con cabeceras `Origin` externas antes de establecer comunicación con el backend.
3. **Portapapeles bajo acción explícita:**
   MirrOS no sondea ni lee automáticamente el portapapeles en segundo plano; las transferencias solo ocurren cuando el usuario ejecuta `Ctrl+C`, `Ctrl+V` o los botones manuales, con límites estrictos de tamaño.
4. **Actualizaciones verificadas con SHA-256:**
   El actualizador integrado solo acepta publicaciones HTTPS del repositorio oficial de GitHub, valida el tamaño y comprueba el hash SHA-256 antes de sustituir el ejecutable portátil, conservando una copia de respaldo (`.mirros-previous`).
5. **Diagnósticos sin datos sensibles:**
   Tanto `mirros --diagnose` como `python -m mirros.diagnostics` omiten UDIDs, nombres personales del dispositivo, rutas privadas del usuario y contenido del portapapeles.

---

## Cómo reportar una vulnerabilidad / Reporting a Vulnerability

- **No abras un Issue público** si el fallo permite acceso no autorizado al servidor local, ejecución arbitraria o exposición de datos del dispositivo.
- Utiliza la función **[Report a vulnerability (Security Advisories)](https://github.com/Cristiant2608/mirros/security/advisories/new)** de GitHub en este repositorio para enviar el reporte de forma privada.
- Incluye los pasos para reproducirlo, el sistema operativo (Windows/Linux) y la versión de MirrOS. Recibirás una respuesta inicial en un plazo máximo de 7 días.
