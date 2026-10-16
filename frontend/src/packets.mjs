// Four-byte big-endian lengths. Fragmented payloads are copied exactly once.
export class PacketAssembler {
  constructor(maxPayload, validLength = () => true) {
    this.maxPayload = maxPayload;
    this.validLength = validLength;
    this.header = new Uint8Array(4);
    this.headerSize = 0;
    this.length = null;
    this.payload = null;
    this.written = 0;
  }
  *push(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      if (this.length === null) {
        const count = Math.min(4 - this.headerSize, chunk.length - offset);
        this.header.set(chunk.subarray(offset, offset + count), this.headerSize);
        this.headerSize += count; offset += count;
        if (this.headerSize < 4) return;
        const length = new DataView(this.header.buffer).getUint32(0);
        this.headerSize = 0;
        if (length > this.maxPayload || !this.validLength(length)) throw new Error('Invalid packet length');
        if (!length) { yield new Uint8Array(0); continue; }
        this.length = length;
      }
      const available = chunk.length - offset;
      if (!this.payload && available >= this.length) {
        const packet = chunk.subarray(offset, offset + this.length);
        offset += this.length; this.length = null;
        yield packet;
        continue;
      }
      // Wait for payload bytes before allocating, even if the header arrived alone.
      if (!available) return;
      this.payload ??= new Uint8Array(this.length);
      const count = Math.min(this.length - this.written, available);
      this.payload.set(chunk.subarray(offset, offset + count), this.written);
      this.written += count; offset += count;
      if (this.written === this.length) {
        const packet = this.payload;
        this.payload = null; this.written = 0; this.length = null;
        yield packet;
      }
    }
  }
}
