/* PCM playback runs on the audio rendering thread, independently of React/video. */
class MirrosPCMPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 48000;
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.read = 0; this.count = 0; this.fraction = 0;
    this.target = 5760; // 120 ms; grow after underruns, up to 240 ms.
    this.playing = false; this.fade = 0;
    this.port.onmessage = ({data}) => {
      if (!(data instanceof ArrayBuffer) || data.byteLength % 4) return;
      const pcm = new DataView(data);
      const frames = data.byteLength / 4;
      // Drop old backlog only at 500 ms, rather than overlap scheduled sources.
      if (this.count + frames > 24000) {
        const keep = Math.min(this.count, Math.max(0, this.target - frames));
        this.read = (this.read + this.count - keep) % this.capacity;
        this.count = keep; this.fraction = 0; this.fade = 0;
      }
      for (let i = Math.max(0, frames - this.capacity); i < frames; i++) {
        const write = (this.read + this.count) % this.capacity;
        this.left[write] = pcm.getInt16(i * 4, true) / 32768;
        this.right[write] = pcm.getInt16(i * 4 + 2, true) / 32768;
        this.count++;
      }
    };
  }
  process(_inputs, outputs) {
    const [left, right] = outputs[0] || [];
    if (!left) return true;
    left.fill(0); right?.fill(0);
    if (!this.playing) {
      if (this.count < this.target) return true;
      this.playing = true; this.fade = 0;
      this.port.postMessage('playing');
    }
    const step = 48000 / sampleRate;
    for (let i = 0; i < left.length; i++) {
      // Fractional resampling also supports devices running at 44.1 kHz.
      if (this.count < Math.max(2, Math.ceil(this.fraction + step))) {
        this.playing = false; this.target = Math.min(11520, this.target + 1920);
        this.port.postMessage('buffering'); break;
      }
      const next = (this.read + 1) % this.capacity;
      const level = Math.min(1, this.fade++ / 128, (this.count - 1) / 128);
      left[i] = (this.left[this.read] + (this.left[next] - this.left[this.read]) * this.fraction) * level;
      if (right) right[i] = (this.right[this.read] + (this.right[next] - this.right[this.read]) * this.fraction) * level;
      this.fraction += step;
      const consumed = Math.floor(this.fraction);
      this.fraction -= consumed;
      this.read = (this.read + consumed) % this.capacity; this.count -= consumed;
    }
    return true;
  }
}
registerProcessor('mirros-pcm', MirrosPCMPlayer);
