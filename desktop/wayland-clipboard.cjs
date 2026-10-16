const {execFile, spawn} = require('node:child_process');

// Electron's clipboard can see its own writes while missing external offers on
// some Wayland compositors. wl-clipboard talks to the compositor directly.
function waylandClipboard(fallback, ClipboardItem, {platform = process.platform, env = process.env, run = execFile, spawnProcess = spawn} = {}) {
  if (platform !== 'linux' || !env.WAYLAND_DISPLAY) return fallback;
  const command = (file, args, input, maxBuffer = 16 * 1024 * 1024) => new Promise((resolve, reject) => {
    const child = run(file, args, {encoding:null, timeout:5000, maxBuffer}, (error, output) => error ? reject(error) : resolve(output));
    child.stdin?.on('error', () => {});
    child.stdin?.end(input);
  });
  const copy = (args, input) => new Promise((resolve, reject) => {
    // wl-copy forks an owner that lives until the next clipboard change. Wait
    // for the parent exit, not inherited pipes closing when that owner dies.
    const child = spawnProcess('wl-copy', args, {stdio:['pipe','ignore','ignore']});
    const timer = setTimeout(() => {child.kill(); reject(new Error('El portapapeles Wayland tardó demasiado.'));}, 5000);
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('exit', code => {clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`wl-copy terminó con código ${code}.`));});
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
  const unavailable = error => error.code === 'ENOENT';
  return {
    async clear() {
      try {await copy(['--clear']);}
      catch (error) {if (unavailable(error)) return fallback.clear(); throw error;}
    },
    async read() {
      let formats;
      try {formats = (await command('wl-paste', ['--list-types'], undefined, 4096)).toString().split('\n');}
      catch (error) {
        if (unavailable(error)) return fallback.read();
        if (error.code === 1) return [];
        throw error;
      }
      const type = formats.includes('image/png') ? 'image/png' : formats.find(type => type === 'text/plain') || formats.find(type => type.startsWith('text/plain;'));
      if (!type) return fallback.read();
      const data = await command('wl-paste', ['--no-newline', '--type', type], undefined, type.startsWith('text/') ? 1024 * 1024 : undefined);
      const mime = type.startsWith('text/') ? 'text/plain' : type;
      return [new ClipboardItem({[mime]:new Blob([data], {type:mime})})];
    },
    async readText() {
      const item = (await this.read()).find(item => item.types.includes('text/plain'));
      return item ? (await item.getType('text/plain')).text() : '';
    },
    async write(items) {
      const item = items.find(item => item.types.includes('image/png')) || items.find(item => item.types.includes('text/plain'));
      if (!item) return fallback.write(items);
      const type = item.types.includes('image/png') ? 'image/png' : 'text/plain';
      const blob = await item.getType(type);
      try {await copy(['--type', type], Buffer.from(await blob.arrayBuffer()));}
      catch (error) {if (unavailable(error)) return fallback.write(items); throw error;}
    },
    async writeText(text) {return this.write([new ClipboardItem({'text/plain':new Blob([text], {type:'text/plain'})})]);},
  };
}
module.exports = {waylandClipboard};
