import {useEffect, useState} from 'react';
import {bridge, initial} from '../bridge.js';
export function useConnection() {
  const [state, setState] = useState(initial);
  useEffect(() => {
    if (!bridge) { setState({...initial, phase: 'conectado', message: 'Conectado'}); return; }
    bridge.state().then(setState); return bridge.subscribe(setState);
  }, []);
  return [state, setState];
}
