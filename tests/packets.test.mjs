import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PacketAssembler} from '../frontend/src/packets.mjs';
const wire = payload => {const bytes = new Uint8Array(4 + payload.length); new DataView(bytes.buffer).setUint32(0, payload.length); bytes.set(payload, 4); return bytes;};
test('packets survive every header and payload split, including consecutive empty packets', () => {
  const bytes = Uint8Array.from([...wire([1,2,3]), ...wire([]), ...wire([4,5])]);
  for (let split = 0; split <= bytes.length; split++) {
    const assembler = new PacketAssembler(100);
    const packets = [...assembler.push(bytes.subarray(0,split)), ...assembler.push(bytes.subarray(split))];
    assert.deepEqual(packets.map(x => [...x]), [[1,2,3], [], [4,5]]);
  }
});
test('contiguous packets reuse input storage and fragmented packets allocate one payload', () => {
  const bytes = wire(new Uint8Array(1024 * 1024).fill(7));
  const contiguous = new PacketAssembler(2**21);
  assert.equal([...contiguous.push(bytes)][0].buffer, bytes.buffer);
  const fragmented = new PacketAssembler(2**21);
  let storage, result;
  for (let i=0; i<bytes.length; i+=127) {
    for (const packet of fragmented.push(bytes.subarray(i,i+127))) result = packet;
    if (fragmented.payload) {
      storage ??= fragmented.payload.buffer;
      assert.equal(fragmented.payload.buffer, storage);
    }
  }
  assert.equal(result.buffer, storage); assert.deepEqual(result, bytes.subarray(4));
  assert.equal(fragmented.payload, null); assert.equal(fragmented.length, null);
});
test('length limits and PCM alignment are checked before allocating payloads', () => {
  for (const length of [0, 33, 0xffffffff]) {
    const assembler = new PacketAssembler(32, n => n > 0);
    const header = new Uint8Array(4); new DataView(header.buffer).setUint32(0,length);
    assert.throws(() => [...assembler.push(header)], /Invalid packet/);
    assert.equal(assembler.payload, null);
  }
  assert.throws(() => [...new PacketAssembler(32,n=>n%4===0).push(wire([1,2,3]))]);
});
test('transferring a fragmented audio packet does not detach following packets', () => {
  const assembler = new PacketAssembler(32);
  const bytes = Uint8Array.from([...wire([1,2,3,4]), ...wire([5,6,7,8])]);
  assert.deepEqual([...assembler.push(bytes.subarray(0,5))], []);
  const packets = assembler.push(bytes.subarray(5));
  const first = packets.next().value;
  const received = structuredClone(first, {transfer:[first.buffer]});
  assert.deepEqual([...received], [1,2,3,4]);
  assert.deepEqual([...packets.next().value], [5,6,7,8]);
});
