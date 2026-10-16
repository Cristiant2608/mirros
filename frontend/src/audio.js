export function startAudio({onStatus, volume = 0.8}) {
  const abort = new AbortController();
  const context = new AudioContext({sampleRate: 48000, latencyHint: 'interactive'});
  const gain = context.createGain(); gain.gain.value = volume; gain.connect(context.destination);
  let stopped = false, scheduled = context.currentTime + .06;
  async function run() {
    try {
      await context.resume();
      const response = await fetch('/audio.bin', {signal: abort.signal});
      if (!response.ok) throw new Error('No se pudo iniciar el audio del iPhone.');
      const reader = response.body.getReader();
      let buffer = new Uint8Array(0);
      onStatus('Esperando sonido del iPhone');
      while (!stopped) {
        const {done, value} = await reader.read(); if (done) break;
        const merged = new Uint8Array(buffer.length + value.length); merged.set(buffer); merged.set(value, buffer.length); buffer = merged;
        while (buffer.length >= 4) {
          const size = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0);
          if (size > 1024 * 1024 || size % 4) throw new Error('Se interrumpió el audio.');
          if (buffer.length < size + 4) break;
          const bytes = buffer.slice(4, size + 4); buffer = buffer.subarray(size + 4);
          const samples = new DataView(bytes.buffer), count = bytes.length / 4;
          if (!count) continue;
          const audio = context.createBuffer(2, count, 48000), left = audio.getChannelData(0), right = audio.getChannelData(1);
          for (let i = 0; i < count; i++) { left[i] = samples.getInt16(i * 4, true) / 32768; right[i] = samples.getInt16(i * 4 + 2, true) / 32768; }
          const node = context.createBufferSource(); node.buffer = audio; node.connect(gain);
          if (scheduled < context.currentTime || scheduled - context.currentTime > .18) scheduled = context.currentTime + .06;
          node.start(scheduled); scheduled += audio.duration; onStatus('Sonando en este PC');
        }
      }
    } catch (error) { if (!stopped) onStatus(error.message || 'No se pudo reproducir el audio.'); }
  }
  run();
  return {stop() {stopped = true; abort.abort(); context.close().catch(() => {});}, setVolume(value) {gain.gain.value = value;}};
}
