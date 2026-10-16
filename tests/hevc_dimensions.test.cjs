const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const scope = {Uint8Array};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/mirros/assets/hevc_dimensions.js'), 'utf8'), scope);
const parse = bytes => JSON.parse(JSON.stringify(scope.iosScrcpyHevcDimensions(bytes)));

function hvcc(width, height, {bottom = 0, layers = 0} = {}) {
    let bits = '';
    const write = (value, count) => { bits += value.toString(2).padStart(count, '0'); };
    const ue = value => { const binary = (value + 1).toString(2); bits += '0'.repeat(binary.length - 1) + binary; };
    write(0, 4); write(layers, 3); write(1, 1); bits += '0'.repeat(96);
    if (layers) {
        for (let i = 0; i < layers; i++) { write(1, 1); write(1, 1); }
        bits += '0'.repeat((8 - layers) * 2 + layers * 96);
    }
    ue(0); ue(1); ue(width); ue(height); write(bottom ? 1 : 0, 1);
    if (bottom) { ue(0); ue(0); ue(0); ue(bottom); }
    bits += '1'; bits = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
    const nal = [0x42, 1];
    let zeros = 0;
    for (let i = 0; i < bits.length; i += 8) {
        const byte = parseInt(bits.slice(i, i + 8), 2);
        if (zeros >= 2 && byte <= 3) { nal.push(3); zeros = 0; }
        nal.push(byte); zeros = byte === 0 ? zeros + 1 : 0;
    }
    const header = new Uint8Array(23); header[0] = 1; header[22] = 1;
    return Uint8Array.from([...header, 33, 0, 1, nal.length >> 8, nal.length & 255, ...nal]);
}

test('portrait SPS overrides Windows 1280x720 decoder defaults', () => {
    assert.deepEqual(parse(hvcc(1264, 2752)), {codedWidth: 1264, codedHeight: 2752, displayAspectWidth: 1264, displayAspectHeight: 2752});
});
test('landscape retains full dimensions', () => {
    assert.deepEqual(parse(hvcc(2752, 1264)), {codedWidth: 2752, codedHeight: 1264, displayAspectWidth: 2752, displayAspectHeight: 1264});
});
test('SPS conformance crop preserves the display aspect ratio', () => {
    assert.equal(parse(hvcc(1264, 2752, {bottom: 8})).displayAspectHeight, 2736);
});
test('skips sublayer profile fields and emulation-prevention bytes', () => {
    assert.equal(parse(hvcc(1264, 2752, {layers: 2})).codedHeight, 2752);
});
test('rejects incomplete configuration and zero dimensions', () => {
    assert.throws(() => parse(hvcc(1264, 2752).slice(0, -3)), /Truncated/);
    assert.throws(() => parse(hvcc(0, 2752)), /Invalid HEVC dimensions/);
});
