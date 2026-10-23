import {memo, useEffect, useState} from 'react';
import {controlStats} from '../transport.js';
// Only the counter renders once per second; the surrounding controls stay untouched.
export const FrameRate = memo(function FrameRate({frames}) {
  const [fps, setFps] = useState(0);
  const [control, setControl] = useState(null);
  useEffect(() => {
    let previous = frames.current;
    const timer = setInterval(() => {
      const current = frames.current;
      setFps(Math.max(0, current - previous)); previous = current;
      const stats = controlStats();
      setControl(stats.lastRoundTripMs != null ? `${stats.mode === 'websocket' ? 'WS' : 'HTTP'} ${Math.max(1, Math.round(stats.lastRoundTripMs))} ms` : null);
    }, 1000);
    return () => clearInterval(timer);
  }, [frames]);
  return <>{fps} fps{control ? ` · ${control}` : ''}</>;
});
