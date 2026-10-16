import {useEffect, useRef, useState} from 'react';
import {startVideo} from '../video.js';
import {followOrientation} from '../orientation.js';
import {native} from '../bridge.js';
export function usePhoneVideo(canvas, connected, floating) {
  const [dimensions, setDimensions] = useState({width: 1264, height: 2752}), [fps, setFps] = useState(0), [live, setLive] = useState(false), [videoStatus, setVideoStatus] = useState('Conectando…'), [rotation, setRotation] = useState(0);
  const video = useRef(null), frames = useRef(0), lastFrameAt = useRef(0);
  useEffect(() => {
    if (!connected || !canvas.current) { setLive(false); return; }
    setLive(false); setFps(0); frames.current = 0; lastFrameAt.current = 0;
    const stop = startVideo(canvas.current, {onFrame: value => { frames.current = value; lastFrameAt.current = performance.now(); setLive(true); }, onStatus: setVideoStatus,
      onDimensions: value => { setDimensions(value); native('dimensions', value); }, onRotation: setRotation});
    video.current = stop;
    const unfollow = followOrientation(value => stop.setOrientation(value));
    let previous = 0;
    const interval = setInterval(() => { setFps(Math.max(0, frames.current - previous)); previous = frames.current; if (lastFrameAt.current && performance.now() - lastFrameAt.current > 4000) setVideoStatus('Esperando actualización de imagen…'); }, 1000);
    return () => { unfollow(); stop(); video.current = null; clearInterval(interval); };
  }, [connected, floating]);
  return {dimensions, fps, live, videoStatus, rotation, video};
}
