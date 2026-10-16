# Diseño de la interfaz de Mirros

La interfaz mantiene un diseño propio y toma como referencias estas guías públicas:

- [Diseñar para macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos): ventanas adaptables y personalización.
- [Barras de herramientas](https://developer.apple.com/design/human-interface-guidelines/toolbars): acceso directo a acciones frecuentes y controles monocromos.
- [Materiales](https://developer.apple.com/design/human-interface-guidelines/materials): separar controles del contenido y conservar la legibilidad.
- [Modo oscuro](https://developer.apple.com/design/human-interface-guidelines/dark-mode): colores semánticos y contraste entre superficies y texto.

## Decisiones

La navegación agrupa cinco tareas: Pantalla, Audio, Portapapeles, Apariencia y Ayuda.
El visor permanece montado al cambiar de sección. Los ajustes se muestran en un panel
lateral independiente, con desplazamiento propio. Una sola barra lateral, fuera del teléfono, reúne navegación, giro, captura, audio, portapapeles,
ventana flotante y siempre encima. La ventana flotante permite cambiar el tamaño
desde sus bordes y esquinas sin deformar el video ni escalar los botones. Una pestaña animada
permite guardar los controles bajo el teléfono y desplegarlos; el ajuste al alto usa el área útil
del monitor. El giro adapta la ventana y las coordenadas de entrada.

Los temas Claro, Oscuro, Lavanda y Océano usan variables CSS para fondos, texto,
separadores y controles. La opción Sistema sigue la preferencia de apariencia del
escritorio. La selección se guarda mediante el proceso nativo y se aplica al modo
flotante. También se respetan las preferencias de reducir movimiento y aumentar
contraste cuando el navegador las comunica.

Los textos nombran acciones y estados, sin eslóganes. No se representa el estado de
silencio del iPhone porque el transporte no permite leerlo.

No se incluyen recursos gráficos de Apple: los fondos se generan con CSS, los iconos
son Lucide (ISC), la marca de Mirros es propia y las fuentes son las disponibles en
el sistema. Esta aplicación no se presenta como producto de Apple ni como avalada
por Apple.

## Verificación local

- Cuatro temas y navegación por las cinco secciones.
- Visor conservado al cambiar de sección.
- Ajuste del teléfono a 760×540, 1120×640 y 1400×900, sin recortar ni desbordar.
- Video real completo a 1264×2752 por USB en Windows.
- Modo flotante con transparencia, barra lateral fija y controles con pestaña deslizante.
- Redimensionado del teléfono con botones de tamaño constante.
- Giro manual de la vista y consulta de orientación con un iPhone conectado.
  El iPhone probado mantuvo vertical la app ante la orden de giro remoto.

Las comprobaciones de interfaz no equivalen a una validación de escritorio Linux.
