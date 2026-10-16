const test = require('node:test');
const assert = require('node:assert/strict');
const {waylandClipboard} = require('../desktop/wayland-clipboard.cjs');
class Item {
  constructor(data) {this.data = data; this.types = Object.keys(data);}
  async getType(type) {return this.data[type];}
}
const options = run => ({platform:'linux', env:{WAYLAND_DISPLAY:'test'}, run});
test('Wayland reads external PNG offers rather than a stale Electron clipboard', async () => {
  const calls = [];
  const clip = waylandClipboard({}, Item, options((file, args, settings, done) => {
    calls.push(args);
    queueMicrotask(() => done(null, Buffer.from(args.includes('--list-types') ? 'text/plain\nimage/png\n' : 'PNG fixture')));
    return {};
  }));
  const [item] = await clip.read();
  assert.deepEqual(item.types, ['image/png']);
  assert.equal(await (await item.getType('image/png')).text(), 'PNG fixture');
  assert.deepEqual(calls[1], ['--no-newline','--type','image/png']);
});
test('Wayland writes UTF-8 through stdin without shell interpolation', async () => {
  let input, flags;
  const {EventEmitter} = require('node:events');
  const clip = waylandClipboard({}, Item, {...options(), spawnProcess:(file,args,settings) => {
    assert.equal(file, 'wl-copy'); flags = args;
    assert.deepEqual(settings.stdio, ['pipe','ignore','ignore']);
    const child = new EventEmitter();
    child.stdin = {on(){}, end(data){input=data; queueMicrotask(()=>child.emit('exit', 0));}};
    return child;
  }});
  await clip.writeText('Texto ñ $(literal)');
  assert.equal(input.toString(), 'Texto ñ $(literal)');
  assert.deepEqual(flags, ['--type','text/plain']);
});
test('missing wl-clipboard falls back to Electron, operational errors propagate', async () => {
  const fallback = {read:async () => ['native']};
  for (const code of ['ENOENT','ETIMEDOUT']) {
    const clip = waylandClipboard(fallback, Item, options((file,args,settings,done) => {
      queueMicrotask(() => done(Object.assign(new Error(code), {code}))); return {};
    }));
    if (code === 'ENOENT') assert.deepEqual(await clip.read(), ['native']);
    else await assert.rejects(clip.read(), /ETIMEDOUT/);
  }
  assert.equal(waylandClipboard(fallback, Item, {platform:'win32'}), fallback);
  assert.equal(waylandClipboard(fallback, Item, {platform:'linux',env:{}}), fallback);
});
