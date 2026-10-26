import {useEffect, useRef, useState} from 'react';
import {startVideo} from '../video.js';
import {followOrientation} from '../orientation.js';
import {native} from '../bridge.js';
export function usePhoneVideo(canvas, connected, floating, quality = 'balanced', forceSoftware = false) {
  const [videoMode, setVideoMode] = useState(null);
  const [dimensions, setDimensions] = useState({width: 1264, height: 2752}), [live, setLive] = useState(false), [videoStatus, setVideoStatus] = useState('Conectando…'), [rotation, setRotation] = useState(0);
  const video = useRef(null), frames = useRef(0), lastFrameAt = useRef(0);
  useEffect(() => {
    if (!connected || !canvas.current) { setLive(false); return; }
    setLive(false); frames.current = 0; lastFrameAt.current = 0;
    setVideoMode(null);
    let seenFrame = false;
    const stop = startVideo(canvas.current, {onFrame: value => { frames.current = value; lastFrameAt.current = performance.now(); if (!seenFrame) { seenFrame = true; setLive(true); } }, onStatus: setVideoStatus,
      onDimensions: value => { setDimensions(value); native('dimensions', value); }, onRotation: setRotation, onMode: setVideoMode, quality, forceSoftware});
    video.current = stop;
    const unfollow = followOrientation(value => stop.setOrientation(value));
    const interval = setInterval(() => { if (lastFrameAt.current && performance.now() - lastFrameAt.current > 4000) { setVideoStatus('Pantalla en reposo · Control activo'); } }, 1000);
    return () => { unfollow(); stop(); video.current = null; clearInterval(interval); };
  }, [connected, quality, forceSoftware]);
  return {dimensions, frames, live, videoStatus, rotation, video, videoMode};
}
