const {test} = require('node:test');
const assert = require('node:assert/strict');
const {shareClipboard} = require('../desktop/clipboard.cjs');
class Item {
  constructor(types) {this.data = types; this.types = Object.keys(types);}
  async getType(type) {return this.data[type];}
}
function fixture() {
  const calls = [], writes = [];
  const clipboard = {
    read:async () => [new Item({'text/plain':new Blob(['texto de prueba'])})],
    readText:async () => '',
    writeText:async text => {writes.push(text);},
    write:async data => {writes.push(data);},
  };
  const nativeImage = {createFromBuffer:data => ({isEmpty:() => false, toPNG:() => data})};
  const deps = {clipboard, ClipboardItem:Item, nativeImage, backendPort:1234, fetch:async (url, options) => {calls.push({url, options}); return {ok:true, json:async () => ({text:'desde iPhone'})};}};
  return {deps, calls, writes};
}
test('async Electron clipboard sends Unicode text without simulating paste', async () => {
  const {deps, calls} = fixture();
  deps.clipboard.read = async () => [new Item({'text/plain':new Blob(['Español 🦋'])})];
  await shareClipboard(deps, 'toPhone');
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), {text:'Español 🦋'});
});
test('iPhone to PC awaits the async clipboard write', async () => {
  const {deps} = fixture(); let written = false;
  deps.clipboard.writeText = async () => {await new Promise(resolve => setTimeout(resolve, 10)); written = true;};
  await shareClipboard(deps, 'toPC'); assert(written);
});
test('a rejected clipboard write is never reported as successful', async () => {
  const {deps} = fixture(); deps.clipboard.writeText = async () => {throw Error('OS clipboard failed');};
  await assert.rejects(shareClipboard(deps, 'toPC'), /OS clipboard failed/);
});
test('disconnected transfer never reads the clipboard', async () => {
  const {deps, calls} = fixture(); deps.backendPort = null;
  deps.clipboard.read = async () => assert.fail('clipboard must not be read');
  await assert.rejects(shareClipboard(deps, 'toPhone'), /Conecta/); assert.equal(calls.length, 0);
});
test('failed device read preserves host clipboard and includes HTTP status', async () => {
  const {deps, writes} = fixture(); deps.fetch = async () => ({ok:false, status:503});
  await assert.rejects(shareClipboard(deps, 'toPC'), /HTTP 503/); assert.equal(writes.length, 0);
});
test('PNG ClipboardItem is sent through the image endpoint', async () => {
  const {deps, calls} = fixture(); const png = Buffer.from('test PNG');
  deps.clipboard.read = async () => [new Item({'image/png':new Blob([png])})];
  await shareClipboard(deps, 'toPhone');
  assert.equal(calls[0].url, 'http://127.0.0.1:1234/clipboard/image'); assert.deepEqual(calls[0].options.body, png);
});
test('empty or excessive text is rejected before HTTP', async () => {
  const {deps, calls} = fixture(); deps.clipboard.read = async () => [];
  await assert.rejects(shareClipboard(deps, 'toPhone'), /Copia/);
  deps.clipboard.readText = async () => 'a'.repeat(1024 * 1024 + 1);
  await assert.rejects(shareClipboard(deps, 'toPhone'), /1 MB/); assert.equal(calls.length, 0);
});
test('image from iPhone is decoded and written as async ClipboardItems', async () => {
  const {deps, writes} = fixture();
  deps.fetch = async url => url.endsWith('/image') ? {ok:true, arrayBuffer:async () => new Uint8Array([1,2]).buffer} : {ok:true, json:async () => ({image:{size:2}, text:'caption'})};
  await shareClipboard(deps, 'toPC');
  assert.equal(writes.length, 1); assert(Array.isArray(writes[0]));
  assert.deepEqual(writes[0][0].types, ['image/png','text/plain']);
  assert.equal(await (await writes[0][0].getType('text/plain')).text(), 'caption');
});
test('oversized device text does not replace the system clipboard', async () => {
  const {deps, writes} = fixture(); deps.fetch = async () => ({ok:true, json:async () => ({text:'a'.repeat(1024*1024+1)})});
  await assert.rejects(shareClipboard(deps, 'toPC'), /1 MB/); assert.equal(writes.length, 0);
});
