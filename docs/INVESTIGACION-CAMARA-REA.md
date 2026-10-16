# Cámara/micrófono con control USB — investigación con el método REA

Fecha: 2026-10-16. Estado: **sin solución USB simultánea validada**.

## Objetivo y límites del usuario

Mantener imagen y control desde el PC mientras una app del iPhone usa cámara y
micrófono. Solo USB. Sin Mac/Xcode ni WebDriverAgent instalado. Pausar la
transmisión y usar Wi-Fi/Bluetooth no cumplen este objetivo.

## Aplicación de la skill

Se leyó `reverse-engineer-anything/SKILL.md` de morluto/rea, revisión
`ae07d151704bac5f0129985cedb92546d2d5411e`, metadata de skill versión 42.
La skill indica emplear herramientas de repositorio cuando está disponible el
código fuente completo. Se aplicó su separación de observaciones, inferencias y
pendientes. La primera revisión fue de fuentes. Después se ejecutó REA CLI 6.5.0 sobre
la DDI y su ejecutable ARM64, y LLVM sobre el código nativo, como se detalla
más abajo. No se configuró MCP. Los IDs SRC/DOC son de esta revisión; los
identificadores `ev_…` son Evidence IDs reales de REA.

## Evidencias disponibles

| ID | Tipo y alcance | Resultado |
| --- | --- | --- |
| SRC-1 | `pymobiledevice3 11.32.0`, `display_service.py:15–37` | El motor reconoce el conflicto cámara/micrófono como CoreDevice 9022. |
| SRC-2 | `display_service.py:74–164` | El video inicia `com.apple.coredevice.feature.startmediastream`; no se encontró un parámetro documentado para excluir el bloqueo de sensores en esta API. No prueba que no exista otra API privada. |
| SRC-3 | `hid_service.py:100–109` | El motor documenta que los eventos táctiles requieren la sesión multimedia activa para autenticarse. |
| SRC-4 | `screen_stream.py`, cierre de `serve()` y `DisplayService.stop_all_streams` | Detener la observación remota libera la sesión que bloquea cámara/micrófono. Es la limpieza usada al desconectar, no un modo simultáneo. |
| SRC-5 | `screen_capture_service.py`, `capture_screenshot()` | Existe captura PNG por otro servicio. No se probó con Cámara activa, y por sí sola no reemplaza el control de SRC-3. |
| DOC-1 | [Guía oficial del motor](https://github.com/doronz88/pymobiledevice3/blob/master/docs/guides/cli-recipes.md) | Documenta que durante la duplicación otras apps no pueden adquirir los sensores; recomienda detenerla. |
| DOC-2 | [Appium: hosts no macOS](https://appium.github.io/appium-xcuitest-driver/12.16/guides/non-macos-hosts/) | Linux/Windows pueden conectarse a WDA preparado/instalado; no pueden usar la estrategia de compilación mediante Xcode. |

Identidad de los archivos locales inspeccionados (SHA-256):

- `display_service.py`: `cf05521c6225ee911b1d53479b89d8bacb2d5389d8a3b22ea59e6c6cde4f8310`
- `hid_service.py`: `89aa6c6b7205e5f513ab6a3a5df691fa6249d62ff84e6f2150859bde81de6796`

## Conclusiones e incógnitas

- **Establecido en el motor disponible:** silenciar el audio del PC o quitar su
  reproducción no finaliza la observación remota. No resuelve este conflicto.
- **Inferencia de SRC-2/3/4:** cambiar únicamente el video a capturas PNG y cerrar
  la sesión multimedia dejaría sin la autorización que usa el control táctil
  actual. No se presenta como solución.
- **Alternativa por investigar:** WDA/XCTest puede cambiar el transporte de
  entrada. Hace falta un runner firmado/preparado para el dispositivo y probar
  captura, control, cámara y micrófono simultáneos. No se ha probado que WDA
  resuelva el caso concreto ni se instaló nada en el teléfono.
- **No establecido:** que alguna opción privada del daemon de iOS conserve
  control y captura sin bloquear sensores. La revisión nativa acotada se documenta abajo; no se validó una opción remota.
  Tampoco se demuestra imposibilidad para todas las arquitecturas de iOS.

## Siguiente investigación reproducible

1. Obtener una copia identificada y autorizada del servicio nativo de la DDI/iOS
   correspondiente al teléfono; registrar versión y hash antes de analizar.
2. Usar REA con un proveedor nativo compatible para seguir el inicio de
   observación remota, la habilitación HID y las comprobaciones de sensores.
3. Identificar una hipótesis concreta a partir de referencias/flujo de código;
   no deducir una capacidad solo de nombres de símbolos o strings.
4. Validar en el iPhone: imagen nueva, clic/arrastre, teclado, cámara con imagen
   y grabación de voz con audio, todo simultáneo y sin sesión de duplicación que
   ocupe los sensores. No realizar llamadas ni enviar mensajes para la prueba.
5. Solo después implementar un transporte alternativo en MirrOS y anunciarlo.

No se cambió el backend, se iniciaron grabaciones ni se instaló software de
captura/control durante esta investigación. La cámara y el micrófono no se dan
por desbloqueados mientras sigue activa la sesión actual.


## Análisis del binario nativo (2026-10-16)

**Resultado:** el ejecutable contiene una rama que omite la restricción de
sensores. Esto corrige la hipótesis de que el bloqueo sería incondicional en
el daemon. No se identificó una opción del protocolo que permita seleccionar
esa rama en el iPhone del usuario; el objetivo simultáneo sigue sin validarse.

### Procedencia y herramientas

Se copió la DDI Cryptex ya almacenada por pymobiledevice3, sin montar una imagen
nueva en el teléfono. BuildManifest: build `27A5228h` (identidad de esta DDI,
no comprobación de la versión que está ejecutándose en el iPhone).

| Artefacto | SHA-256 |
| --- | --- |
| `Image.dmg`, 15 895 040 bytes | `873097f695a8b9734e2abc54f795a8874d40ff6fd11208ecb01ef29534c7c176` |
| `usr/libexec/dtremotedisplayd`, universal arm64/arm64e | `5ac94652b4f7cfc076dd5867c6d957e988e526aa78576f6deb7f2ab7deae85ca` |
| Slice arm64, offset 16 384, longitud 405 728 | `c1d73d08e321b2ac49e96baefd9df4b92cb650d6cccdc596d11566bd39588656` |
| `usr/libexec/dtuhidd` | `f0441b3626365706e4ee8f235d932b9b759243fd594bafefaca1b79a320087ae` |

UUID arm64: `6C1E7827-DA6C-381C-9AD1-52065F1C11C5`, SDK 27.0, minOS 17.0.
Los archivos se conservaron en `/tmp/mirros-native-analysis`; no se incluyen
binarios de Apple en Git. REA se instaló solo en `/tmp/mirros-rea-tools`.

REA reconoció el DMG pero su inventario de hijos requiere adaptador macOS.
Se descomprimieron los bloques UDIF/zlib y 7-Zip 26.04 extrajo APFS en Linux.
REA rechazó el FAT por no tener slice x64 compatible con el host; al separar
la slice arm64 sí completó la inspección del artefacto. El flujo de código se
analizó con `llvm-objdump`, no con un decompilador de REA.

- DMG, Evidence ID: `ev_ee69e46154b7fbdf096009a9485fdc80f581950cadfa505c1d817d3ab521270e`.
- Slice ARM64, Evidence ID: `ev_1b703f270117044c49c82a524e90cabc3ff64bd89fc608458ab480fd652abf89`.
- Los IDs anteriores acreditan inspecciones estáticas del artefacto; no
  acreditan ejecución ni validación funcional. Las direcciones siguientes
  proceden de LLVM y no se presentan como resultados de decompilación REA.

### Observaciones verificadas en instrucciones ARM64

Direcciones virtuales sin ASLR, slice arm64 de la identidad anterior:

| Lugar | Observación |
| --- | --- |
| `0x10002ab38` | Comprueba variante darwinOS y disponibilidad de selectores de MediaExperience. Sin las SPI, devuelve falso para elegibilidad de enforcement. |
| `0x10002ee34` | Calcula si aplica enforcement. Lee el resultado de disponibilidad, `standardUserDefaults.boolForKey("treatSystemAsCustomerVariantOS")` y otra comprobación del dispositivo. |
| `0x10002efb0`, `0x10002efc0–0x10002efc4` | Combina elegibilidad con la preferencia y el resultado de la comprobación del dispositivo mediante AND/OR. La preferencia no constituye un interruptor demostrado para desactivar la restricción. |
| `0x10002af04–0x10002af58` | Si corresponde enforcement, llama `remoteDeviceControlIsAllowed:` y bifurca según el resultado. La rama de rechazo registra cámara/micrófono en uso. |
| `0x10002c00c–0x10002c010` | Consulta el mismo cálculo antes de iniciar observación; si devuelve cero, salta a una ruta que registra que no informará a MediaExperience. |
| `0x10002c258–0x10002c25c` | La ruta normal pasa `w2=1` a `setDeviceIsBeingObservedRemotely:`. |
| `0x10002c76c–0x10002c770` | La ruta de parada pasa `w2=0` al mismo selector. |
| `0x1000205b4` | Referencia de llamada hacia la rutina de inicio de observación `0x10002bf44`. |

La atribución de las rutinas de inicio/parada usa tanto las instrucciones como
sus referencias a los nombres de función y mensajes de diagnóstico. No se
concluye el comportamiento únicamente a partir de strings.

### Interpretación y límites

El bloqueo tiene un mecanismo de coordinación explícito con MediaExperience;
no basta con quitar la reproducción de audio del PC. Existe código para otros
entornos/variantes donde se omite esa coordinación. **No demuestra que el
usuario pueda elegir ese entorno mediante una petición multimedia.** Tampoco
se demostró que cambiar preferencias del daemon esté permitido desde un PC
emparejado ni que libere los sensores conservando la autorización HID.

`dtuhidd` se identificó y se revisaron sus strings/símbolos de descriptor HID,
pero no se resolvió el flujo completo de autenticación en BackBoard. Esa parte
sigue sustentada por SRC-3, no por una verificación nativa completa.

No se modificó ni parcheó un ejecutable firmado, se cambiaron preferencias del
iPhone o se detuvo su sesión actual. No hay prueba física de simultaneidad y
no se afirma imposibilidad universal. La siguiente investigación concreta es
resolver la comprobación del dispositivo en `0x10002ee34` y determinar si hay
un acceso remoto permitido a su política, antes de proponer cambios de MirrOS.

### Repetición de las inspecciones

Con los artefactos de esta sesión en `/tmp/mirros-native-analysis`:

```sh
/tmp/mirros-rea-tools/node_modules/.bin/rea inspect-artifact /tmp/mirros-native-analysis/dtremotedisplayd.arm64 --format json
llvm-objdump --macho --arch=arm64 --disassemble --symbolize-operands /tmp/mirros-native-analysis/extracted/usr/libexec/dtremotedisplayd
llvm-objdump --macho --arch=arm64 --private-headers /tmp/mirros-native-analysis/extracted/usr/libexec/dtremotedisplayd
```

Resultados completos: `dmg-inspect.json`, `display-arm64-rea.json`,
`display-disassembly.txt`, `display-symbols.txt`, `display-headers.txt`.
`display-rea.json` conserva el rechazo inicial del FAT, para no ocultar esa
limitación del proveedor. `/tmp` es temporal y debe preservarse aparte si se
requiere retomar el análisis después de limpiar o reiniciar el equipo.
