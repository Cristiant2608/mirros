import {useEffect, useRef, useState} from 'react';
import {startAudio} from '../audio.js';
export function useAudio(connected) {
  const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('audio') !== 'off'), [audioStatus, setAudioStatus] = useState('Esperando conexión'), [volume, setVolume] = useState(.8);
  const audio = useRef(null);
  useEffect(() => {
    if (!connected || !audioEnabled) { setAudioStatus(audioEnabled ? 'Esperando conexión' : 'Audio desactivado'); return; }
    audio.current = startAudio({onStatus: setAudioStatus, volume});
    return () => { audio.current?.stop(); audio.current = null; };
  }, [connected, audioEnabled]);
  useEffect(() => { audio.current?.setVolume(volume); }, [volume]);
  function toggleAudio() { setAudioEnabled(value => {localStorage.setItem('audio', value ? 'off' : 'on'); return !value;}); }
  return {audioEnabled, audioStatus, volume, setVolume, toggleAudio};
}
