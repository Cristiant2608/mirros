import {iosScrcpyHevcDimensions} from '../../src/mirros/assets/hevc_dimensions.js';
import {frameRotation} from './orientation.js';
import {PacketAssembler} from './packets.mjs';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function startVideo(canvas, {onFrame, onStatus, onDimensions, onRotation = () => {}, onMode = () => {}, quality = 'balanced', forceSoftware = false}) {
  const abort = new AbortController();
  let decoder, pending, lastFrame, raf, renderTimer = null, disposed = false, frames = 0, errors = 0, software = forceSoftware, orientation = 'portrait', rotation = 0, manualAngle = null;
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
    context.drawImage(frame.bitmap || frame, -frame.displayWidth / 2, -frame.displayHeight / 2, frame.displayWidth, frame.displayHeight);
    context.setTransform(1, 0, 0, 1, 0, 0);
  };
  const render = () => {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
    const frame = pending; pending = null;
    if (!frame || disposed) { frame?.close(); return; }
    try {
      draw(frame);
      frames++; onFrame(frames);
    } finally { lastFrame?.close(); lastFrame = frame; }
  };
  const output = frame => {
    if (disposed) { frame.close(); return; }
    pending?.close();
    pending = frame;
    if (!raf) {
      raf = requestAnimationFrame(render);
      renderTimer = setTimeout(render, 32);
    }
  };
  async function run() {
    while (!disposed) {
      let reader;
      try {
        if (software) {
          onMode('software');
          onStatus('Conectando video compatible…');
          const response = await fetch(`/frames.bin?quality=${encodeURIComponent(quality)}`, {signal:abort.signal,cache:'no-store'});
          if (!response.ok) throw new Error('Esperando video del iPhone…');
          reader = response.body.getReader(); const packets = new PacketAssembler(16 * 1024 * 1024, size => size > 0);
          while (!disposed) {
            const {done,value} = await reader.read();if (done) break;
            if (disposed) break;
            for (const packet of packets.push(value)) {
              const bitmap = await createImageBitmap(new Blob([packet], {type:'image/jpeg'}));
              output({bitmap,displayWidth:bitmap.width,displayHeight:bitmap.height,close:()=>bitmap.close()});
            }
          }
          if (disposed) break;
          throw new Error('El video compatible se interrumpió. Reconectando…');
        }
        onStatus('Conectando con la pantalla…');
        const codecResponse = await fetch('/codec', {signal: abort.signal, cache: 'no-store'});
        if (!codecResponse.ok) throw new Error('Esperando video del iPhone…');
        const info = await codecResponse.json();
        const description = Uint8Array.from(atob(info.description), c => c.charCodeAt(0));
        let config = {codec: info.codec, description, ...iosScrcpyHevcDimensions(description), optimizeForLatency: true};
        const support = typeof VideoDecoder !== 'undefined' && await VideoDecoder.isConfigSupported(config);
        if (!support?.supported) { software = true; continue; }
        const createDecoder = () => {
          const result = new VideoDecoder({output, error: () => { errors++; onStatus('Recuperando imagen…'); }});
          result.configure(config); return result;
        };
        decoder = createDecoder();
        onMode('native');
        const response = await fetch('/stream.bin', {signal: abort.signal, cache: 'no-store'});
        if (!response.ok) throw new Error('No se pudo iniciar el video. Reintentando…');
        reader = response.body.getReader();
        const packets = new PacketAssembler(32 * 1024 * 1024, size => size > 0);
        let timestamp = 0, key = false, lastPliAt = -Infinity;
        while (!disposed) {
          const {done, value} = await reader.read();
          if (done) break;
          if (disposed) break;
          for (const packet of packets.push(value)) {
            const type = packet[0], data = packet.subarray(1);
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
            if (errors >= 2) { software = true; throw new Error('Cambiando a video compatible…'); }
            if (!key || decoder.state !== 'configured') continue;
            if (decoder.decodeQueueSize > 32) {
              const now = performance.now();
              if (now - lastPliAt > 2000) {
                lastPliAt = now;
                fetch('/pli', {method: 'POST'}).catch(() => {});
              }
              key = false;
              continue;
            }
            decoder.decode(new EncodedVideoChunk({type: type === 0 || type === 2 ? 'key' : 'delta', timestamp, data}));
            timestamp += 16666;
          }
        }
      } catch (error) {
        if (!disposed) onStatus(error.message || 'Recuperando la conexión…');
      } finally {
        try { await reader?.cancel(); } catch {}
        try { reader?.releaseLock(); } catch {}
        try { decoder?.close(); } catch {}
      }
      if (!disposed) await delay(1000);
    }
  }
  run();
  const stop = () => { if (disposed) return; disposed = true; abort.abort(); if (raf) cancelAnimationFrame(raf); if (renderTimer) clearTimeout(renderTimer); pending?.close(); pending = null; lastFrame?.close(); lastFrame = null; try { decoder?.close(); } catch {} };
  stop.setOrientation = value => { manualAngle = null; orientation = value; if (lastFrame && !disposed) draw(lastFrame); };
  stop.rotateView = () => { manualAngle = (rotation + 90) % 360; if (lastFrame && !disposed) draw(lastFrame); };
  return stop;
}
