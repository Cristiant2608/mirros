import {useEffect, useState} from 'react';
import {bridge, initial} from '../bridge.js';

function initialWebMode() {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get('mode');
    if (urlMode === 'phone' || urlMode === 'studio') return urlMode;
  }
  return bridge ? initial.mode : 'phone';
}

export function useConnection() {
  const [state, setState] = useState(() => ({...initial, mode: initialWebMode()}));
  useEffect(() => {
    if (!bridge) {
      const mode = initialWebMode();
      setState(prev => ({...prev, mode, phase: 'conectado', message: 'Conectado'}));
      fetch('/info').then(r => r.ok ? r.json() : null).then(info => {
        if (info && typeof info === 'object') {
          setState(prev => ({
            ...prev,
            device: {name: info.model || 'iPhone', model: info.model || null},
          }));
        }
      }).catch(() => {});
      fetch('/display-mode').then(r => r.ok ? r.json() : null).then(dm => {
        if (dm && (dm.mode === 'dual' || dm.mode === 'aod')) {
          setState(prev => ({...prev, displayMode: dm.mode}));
        }
      }).catch(() => {});
      return;
    }
    bridge.state().then(setState); return bridge.subscribe(setState);
  }, []);
  return [state, setState];
}
