import {PacketAssembler} from './packets.mjs';
export function startAudio({onStatus, volume = 0.8}) {
  const abort = new AbortController();
  const context = new AudioContext({sampleRate: 48000, latencyHint: 'playback'});
  const gain = context.createGain(); gain.gain.value = volume; gain.connect(context.destination);
  let stopped = false, player, lastStatus;
  const status = message => { if (!stopped && message !== lastStatus) {lastStatus = message; onStatus(message);} };
  const wait = ms => new Promise(resolve => {
    const finish = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms); abort.signal.addEventListener('abort', finish, {once: true});
    if (abort.signal.aborted) finish();
  });
  async function run() {
    try {
      await context.audioWorklet.addModule('/audio-worklet.js');
      if (stopped) return;
      player = new AudioWorkletNode(context, 'mirros-pcm', {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]});
      player.port.onmessage = ({data}) => status(data === 'playing' ? 'Sonando en este PC' : 'Estabilizando audio…');
      player.connect(gain);
      await context.resume();
      while (!stopped) {
        let reader;
        try {
          const response = await fetch('/audio.bin', {signal: abort.signal});
          if (!response.ok) throw new Error('No se pudo iniciar el audio del iPhone.');
          reader = response.body.getReader();
          const packets = new PacketAssembler(1024 * 1024, size => size % 4 === 0);
          status('Esperando sonido del iPhone');
          while (!stopped) {
            const {done, value} = await reader.read();
            if (done) throw new Error('La transmisión de audio se interrumpió.');
            if (stopped) break;
            for (const packet of packets.push(value)) {
              if (packet.length) {
                // Transfer only this payload; never detach a chunk containing later packets.
                const bytes = packet.byteOffset === 0 && packet.byteLength === packet.buffer.byteLength ? packet : packet.slice();
                player.port.postMessage(bytes.buffer, [bytes.buffer]);
              }
            }
          }
        } catch (error) {
          if (!stopped) status('Reconectando audio…');
        } finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
        if (!stopped) await wait(750);
      }
    } catch (error) { status(error.message || 'No se pudo reproducir el audio.'); }
  }
  run();
  return {stop() {if (stopped) return; stopped = true; abort.abort(); player?.disconnect(); player?.port.close(); gain.disconnect(); context.close().catch(() => {});}, setVolume(value) {gain.gain.value = value;}};
}
