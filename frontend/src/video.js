import {iosScrcpyHevcDimensions} from '../../src/mirros/assets/hevc_dimensions.js';
import {frameRotation} from './orientation.js';
import {PacketAssembler} from './packets.mjs';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const DET_H = 344;
const RVRA_TIERS = [
  [720, 1280],
  [1088, 1920],
  [1170, 2532],
  [1280, 720],
  [1920, 1088],
  [2532, 1170],
];
let detCanvas = null, detCtx = null;
export function detectContentCrop(frame, fw, fh) {
  if (!fw || !fh || typeof document === 'undefined') return {srcW: fw, srcH: fh};
  if (!detCanvas) {
    detCanvas = document.createElement?.('canvas') || null;
    detCtx = detCanvas?.getContext?.('2d', {willReadFrequently: true}) || null;
  }
  if (!detCtx) return {srcW: fw, srcH: fh};
  const DW = Math.max(8, Math.round(DET_H * fw / fh));
  if (detCanvas.width !== DW) detCanvas.width = DW;
  if (detCanvas.height !== DET_H) detCanvas.height = DET_H;
  try {
    detCtx.drawImage(frame.bitmap || frame, 0, 0, DW, DET_H);
    const d = detCtx.getImageData(0, 0, DW, DET_H)?.data;
    if (!d || d.length < DW * DET_H * 4) return {srcW: fw, srcH: fh};
    // Match both full-range Y=128 (~128) and limited-range BT.601/BT.709 Y=128 (~139 on VAAPI/Mesa).
    const isNeutralPadding = (x, y) => {
      const i = (y * DW + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      return r >= 120 && r <= 146 && Math.abs(r - g) <= 4 && Math.abs(g - b) <= 4 && Math.abs(r - b) <= 4;
    };
    const sampleH = Math.max(8, Math.floor(DET_H * 0.45));
    const sampleW = Math.max(8, Math.floor(DW * 0.45));
    let cr = 0;
    for (let x = 0; x < DW; x++) {
      let g = 0, n = 0;
      for (let y = 0; y < sampleH; y += 2) { n++; if (isNeutralPadding(x, y)) g++; }
      if (g / n < 0.75) cr = x;
    }
    let cb = 0;
    for (let y = 0; y < DET_H; y++) {
      let g = 0, n = 0;
      for (let x = 0; x < sampleW; x += 2) { n++; if (isNeutralPadding(x, y)) g++; }
      if (g / n < 0.75) cb = y;
    }
    const cw = Math.round(((cr + 1) / DW) * fw);
    const ch = Math.round(((cb + 1) / DET_H) * fh);
    for (const [tw, th] of RVRA_TIERS) {
      if (tw < fw && th < fh && Math.abs(cw - tw) <= 28 && Math.abs(ch - th) <= 28) {
        return {srcW: tw, srcH: th};
      }
    }
    if (cw > fw * 0.2 && cw < fw * 0.96 && ch > fh * 0.2 && ch < fh * 0.96) {
      return {srcW: cw, srcH: ch};
    }
  } catch {}
  return {srcW: fw, srcH: fh};
}
export function startVideo(canvas, {onFrame, onStatus, onDimensions, onRotation = () => {}, onMode = () => {}, quality = 'balanced', forceSoftware = false}) {
  const abort = new AbortController();
  let decoder, pending, lastFrame, raf, renderTimer = null, disposed = false, frames = 0, errors = 0, software = forceSoftware, orientation = 'portrait', rotation = 0, manualAngle = null, lockW = 0, lockH = 0;
  const context = canvas.getContext('2d', {alpha: false});
  const draw = frame => {
    const fw = frame.displayWidth, fh = frame.displayHeight;
    const angle = manualAngle ?? frameRotation(orientation, fw, fh);
    if (rotation !== angle) { onRotation(angle); rotation = angle; }
    const sideways = Math.abs(angle) === 90;
    const targetW = sideways ? fh : fw, targetH = sideways ? fw : fh;
    if ((targetW > targetH) !== (lockW > lockH)) { lockW = 0; lockH = 0; }
    if (targetW > lockW || targetH > lockH) {
      lockW = Math.max(lockW, targetW);
      lockH = Math.max(lockH, targetH);
    }
    const width = lockW || targetW, height = lockH || targetH;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; onDimensions({width, height}); }
    const {srcW, srcH} = detectContentCrop(frame, fw, fh);
    const fpW = sideways ? height : width, fpH = sideways ? width : height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.translate(width / 2, height / 2);
    context.rotate(angle * Math.PI / 180);
    const source = frame.bitmap || frame;
    if (srcW !== fw || srcH !== fh || fpW !== fw || fpH !== fh) {
      context.drawImage(source, 0, 0, srcW, srcH, -fpW / 2, -fpH / 2, fpW, fpH);
    } else {
      context.drawImage(source, -fw / 2, -fh / 2, fw, fh);
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
  };
  const render = () => {
    if (raf) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      raf = null;
    }
    if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
    const frame = pending; pending = null;
    if (!frame || disposed) { frame?.close(); return; }
    try {
      draw(frame);
      errors = 0;
      frames++; onFrame(frames);
    } finally { lastFrame?.close(); lastFrame = frame; }
  };
  const output = frame => {
    if (disposed) { frame.close(); return; }
    pending?.close();
    pending = frame;
    if (!raf && !renderTimer) {
      if (typeof requestAnimationFrame === 'function') {
        raf = requestAnimationFrame(render);
      }
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
            if (!key) {
              const now = performance.now();
              if (now - lastPliAt > 800) {
                lastPliAt = now;
                fetch('/pli', {method: 'POST'}).catch(() => {});
              }
              continue;
            }
            if (decoder.state !== 'configured') continue;
            if (decoder.decodeQueueSize > 32 && type === 1) {
              const now = performance.now();
              if (now - lastPliAt > 800) {
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
