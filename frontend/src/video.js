import {iosScrcpyHevcDimensions} from '../../src/ios_scrcpy/assets/hevc_dimensions.js';
import {frameRotation} from './orientation.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function startVideo(canvas, {onFrame, onStatus, onDimensions, onRotation = () => {}}) {
  const abort = new AbortController();
  let decoder, pending, lastFrame, raf, disposed = false, frames = 0, errors = 0, orientation = 'portrait', rotation = 0, manualAngle = null;
  const context = canvas.getContext('2d', {alpha: false});
  const draw = frame => {
    const angle = manualAngle ?? frameRotation(orientation, frame.displayWidth, frame.displayHeight);
    if (rotation !== angle) { onRotation(angle); rotation = angle; }
    const sideways = Math.abs(angle) === 90;
    const width = sideways ? frame.displayHeight : frame.displayWidth, height = sideways ? frame.displayWidth : frame.displayHeight;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; onDimensions({width, height}); }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.translate(width / 2, height / 2);
    context.rotate(angle * Math.PI / 180);
    context.drawImage(frame, -frame.displayWidth / 2, -frame.displayHeight / 2, frame.displayWidth, frame.displayHeight);
    context.setTransform(1, 0, 0, 1, 0, 0);
  };
  const render = () => {
    raf = null;
    const frame = pending; pending = null;
    if (!frame || disposed) { frame?.close(); return; }
    try {
      draw(frame);
      frames++; onFrame(frames);
    } finally { lastFrame?.close(); lastFrame = frame; }
  };
  const output = frame => { pending?.close(); pending = frame; if (!raf) raf = requestAnimationFrame(render); };
  async function run() {
    while (!disposed) {
      let reader;
      try {
        onStatus('Conectando con la pantalla…');
        const codecResponse = await fetch('/codec', {signal: abort.signal, cache: 'no-store'});
        if (!codecResponse.ok) throw new Error('Esperando video del iPhone…');
        const info = await codecResponse.json();
        const description = Uint8Array.from(atob(info.description), c => c.charCodeAt(0));
        let config = {codec: info.codec, description, ...iosScrcpyHevcDimensions(description), optimizeForLatency: true};
        const support = await VideoDecoder.isConfigSupported(config);
        if (!support.supported) throw new Error('Este equipo no pudo decodificar el video HEVC del iPhone.');
        const createDecoder = () => {
          const result = new VideoDecoder({output, error: () => { errors++; onStatus('Recuperando imagen…'); }});
          result.configure(config); return result;
        };
        decoder = createDecoder();
        const response = await fetch('/stream.bin', {signal: abort.signal, cache: 'no-store'});
        if (!response.ok) throw new Error('No se pudo iniciar el video. Reintentando…');
        reader = response.body.getReader();
        let buffer = new Uint8Array(0), timestamp = 0, key = false;
        while (!disposed) {
          const {done, value} = await reader.read();
          if (done) break;
          const merged = new Uint8Array(buffer.length + value.length); merged.set(buffer); merged.set(value, buffer.length); buffer = merged;
          while (buffer.length >= 4) {
            const length = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0);
            if (length < 1 || length > 32 * 1024 * 1024) throw new Error('Se interrumpió el video. Recuperando…');
            if (buffer.length < 4 + length) break;
            const type = buffer[4], data = buffer.slice(5, 4 + length); buffer = buffer.subarray(4 + length);
            if (type === 0 || type === 2) {
              key = true;
              if (type === 2 || decoder.state === 'closed') {
                try { decoder.close(); } catch {}
                // A restart/rotation can change the SPS; use its new dimensions.
                try {
                  const latest = await (await fetch('/codec', {signal: abort.signal})).json();
                  const extra = Uint8Array.from(atob(latest.description), c => c.charCodeAt(0));
                  config = {codec: latest.codec, description: extra, ...iosScrcpyHevcDimensions(extra), optimizeForLatency: true};
                } catch {}
                decoder = createDecoder();
              }
            }
            if (!key || decoder.state !== 'configured') continue;
            if (decoder.decodeQueueSize > 8) { key = false; fetch('/pli', {method: 'POST'}).catch(() => {}); continue; }
            decoder.decode(new EncodedVideoChunk({type: type === 0 || type === 2 ? 'key' : 'delta', timestamp, data}));
            timestamp += 16666;
          }
        }
      } catch (error) {
        if (!disposed) onStatus(error.message || 'Recuperando la conexión…');
      } finally {
        try { await reader?.cancel(); } catch {}
        try { decoder?.close(); } catch {}
      }
      if (!disposed) await delay(1000);
    }
  }
  run();
  const stop = () => { disposed = true; abort.abort(); if (raf) cancelAnimationFrame(raf); pending?.close(); pending = null; lastFrame?.close(); lastFrame = null; try { decoder?.close(); } catch {} };
  stop.setOrientation = value => { manualAngle = null; orientation = value; if (lastFrame && !disposed) draw(lastFrame); };
  stop.rotateView = () => { manualAngle = (rotation + 90) % 360; if (lastFrame && !disposed) draw(lastFrame); };
  return stop;
}
