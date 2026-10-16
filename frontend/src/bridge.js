export const bridge = window.mirros;
export const native = (name, value) => bridge?.action(name, value);
export const initial = {phase: 'buscando', message: 'Conecta tu iPhone por USB', mode: 'studio', alwaysOnTop: false, size: 'mediano', theme: 'claro', controlsVisible: true};
