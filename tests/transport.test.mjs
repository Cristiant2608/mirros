import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../frontend/src/transport.js', import.meta.url), 'utf8');
const {createTransport, encodeControl} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const location = {href: 'http://127.0.0.1:1234/', protocol: 'http:'};
function fixture({ack = true, open = true, status = 200} = {}) {
  const sent = [], sockets = [], calls = [];
  class Socket {
    constructor(url, protocol) {
      this.url = url; this.protocol = protocol; this.readyState = 0; sockets.push(this);
      queueMicrotask(() => { if (open) { this.readyState = 1; this.onopen(); } else this.onerror(); });
    }
    close() { this.readyState = 3; this.onclose?.(); }
    send(bytes) {
      sent.push(bytes);
      if (ack) queueMicrotask(() => {
        const result = new ArrayBuffer(11), view = new DataView(result);
        view.setUint8(0, 1); view.setUint32(1, new DataView(bytes).getUint32(2)); view.setUint16(5, status); view.setUint32(7, 250);
        this.onmessage({data: result});
      });
    }
  }
  const transport = createTransport({WebSocket: Socket, location, timeout: 30, fetch: async (...args) => { calls.push(args); return {ok: true}; }});
  return {transport, sent, sockets, calls};
}
test('wire layout matches backend fixtures', () => {
  assert.equal(Buffer.from(encodeControl('/touch', {type:'contact', x:4660, y:65535}, 7)).toString('hex'), '0101000000071234ffff');
  assert.equal(Buffer.from(encodeControl('/key', {usages:[227,25]}, 8)).toString('hex'), '010300000008000200e30019');
  assert.throws(() => encodeControl('/key', {usages:[256]}, 1));
});
test('reuses one socket and acknowledges serialized input with dispatch metrics', async () => {
  const f = fixture();
  await Promise.all([f.transport.post('/touch', {type:'contact', x:1,y:2}), f.transport.post('/touch', {type:'release', x:1,y:2}), f.transport.post('/key', {usages:[]})]);
  assert.equal(f.sockets.length, 1); assert.equal(f.sent.length, 3); assert.equal(f.calls.length, 0);
  assert.equal(f.transport.stats().acknowledged, 3); assert.equal(f.transport.stats().lastDispatchMs, .25);
  f.transport.close();
});
test('unsupported handshake falls back to HTTP with cooldown', async () => {
  const f = fixture({open:false});
  await f.transport.post('/key', {usages:[4]}); await f.transport.post('/key', {usages:[]});
  assert.equal(f.sockets.length, 1); assert.equal(f.calls.length, 2);
});
test('lost ACK rejects without replaying the command over HTTP', async () => {
  const f = fixture({ack:false});
  await assert.rejects(f.transport.post('/key', {usages:[4]}));
  assert.equal(f.sent.length, 1); assert.equal(f.calls.length, 0);
  await f.transport.post('/key', {usages:[]}); assert.equal(f.calls.length, 1);
});
test('backend rejection is reported rather than resent', async () => {
  const f = fixture({status:503});
  await assert.rejects(f.transport.post('/key', {usages:[4]}));
  assert.equal(f.calls.length, 0); f.transport.close();
});
