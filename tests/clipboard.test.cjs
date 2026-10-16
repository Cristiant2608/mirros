const {test} = require('node:test');
const assert = require('node:assert/strict');
const {shareClipboard} = require('../desktop/clipboard.cjs');
function fixture() {
  const calls = [], writes = [];
  const clipboard = {readImage: () => ({isEmpty: () => true}), readText: () => 'texto de prueba', writeText: text => writes.push(text), write: data => writes.push(data)};
  const deps = {clipboard, nativeImage: {}, backendPort: 1234, fetch: async (url, options) => {calls.push({url, options}); return {ok: true, json: async () => ({text: 'desde iPhone'})};}};
  return {deps, calls, writes};
}
test('PC to iPhone sends Unicode text without simulating paste', async () => {
  const {deps, calls} = fixture(); deps.clipboard.readText = () => 'Español 🦋';
  await shareClipboard(deps, 'toPhone');
  assert.equal(calls.length, 1); assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {text: 'Español 🦋'});
});
test('iPhone to PC updates the system clipboard', async () => {
  const {deps, writes} = fixture(); await shareClipboard(deps, 'toPC'); assert.deepEqual(writes, ['desde iPhone']);
});
test('disconnected transfer never reads the clipboard', async () => {
  const {deps, calls} = fixture(); deps.backendPort = null;
  deps.clipboard.readText = () => assert.fail('clipboard must not be read');
  await assert.rejects(shareClipboard(deps, 'toPhone'), /Conecta/); assert.equal(calls.length, 0);
});
test('failed device read preserves host clipboard', async () => {
  const {deps, writes} = fixture(); deps.fetch = async () => ({ok: false});
  await assert.rejects(shareClipboard(deps, 'toPC'), /desbloqueado/); assert.equal(writes.length, 0);
});
test('PNG is sent through the image endpoint', async () => {
  const {deps, calls} = fixture(); const png = Buffer.from('png');
  deps.clipboard.readImage = () => ({isEmpty: () => false, toPNG: () => png});
  await shareClipboard(deps, 'toPhone'); assert.equal(calls[0].url, 'http://127.0.0.1:1234/clipboard/image'); assert.equal(calls[0].options.body, png);
});
test('empty or excessive text is rejected before HTTP', async () => {
  const {deps, calls} = fixture(); deps.clipboard.readText = () => '';
  await assert.rejects(shareClipboard(deps, 'toPhone'), /Copia/);
  deps.clipboard.readText = () => 'a'.repeat(1024 * 1024 + 1);
  await assert.rejects(shareClipboard(deps, 'toPhone'), /1 MB/); assert.equal(calls.length, 0);
});
test('image from iPhone is decoded before writing host clipboard', async () => {
  const {deps, writes} = fixture(); const image = {isEmpty: () => false};
  deps.nativeImage.createFromBuffer = () => image;
  deps.fetch = async url => url.endsWith('/image') ? {ok: true, arrayBuffer: async () => new Uint8Array([1,2]).buffer} : {ok: true, json: async () => ({image: {size: 2}, text: 'caption'})};
  await shareClipboard(deps, 'toPC'); assert.deepEqual(writes, [{image, text: 'caption'}]);
});
