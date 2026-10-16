// Real Electron clipboard regression: uses fixtures and restores the original clipboard.
const {app, BrowserWindow, clipboard, ClipboardItem, nativeImage} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {shareClipboard} = require('../desktop/clipboard.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mirros-clipboard-check-'));
app.setPath('userData', profile);
let window, server, original, result = 0;
const deadline = setTimeout(() => {console.error('Clipboard integration timed out'); app.exit(1);}, 30000);
app.whenReady().then(async () => {
  window = new BrowserWindow({width:320, height:160, show:false, webPreferences:{sandbox:true}});
  await window.loadURL('data:text/plain,MirrOS clipboard validation');
  window.show();
  // Materialize OS payloads before replacing their owner, without logging contents.
  original = await Promise.all((await clipboard.read()).filter(item => item.types.length > 0).map(async item => {
    const types = {};
    for (const type of item.types) types[type] = await item.getType(type);
    return new ClipboardItem(types);
  }));
  let content = {text:''}, png = null, received;
  server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'POST') {
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        received = Buffer.concat(chunks);
        if (request.url === '/clipboard') content = JSON.parse(received);
        else {png = received; content = {image:{size:png.length}};}
        response.end('{}');
      } else if (request.url === '/clipboard/image') response.end(png);
      else {response.setHeader('Content-Type','application/json'); response.end(JSON.stringify(content));}
    } catch (error) {response.writeHead(500); response.end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const deps = {clipboard, ClipboardItem, nativeImage, fetch, backendPort:server.address().port};
  await clipboard.writeText('MirrOS Español 🦋');
  await shareClipboard(deps, 'toPhone');
  assert.deepEqual(content, {text:'MirrOS Español 🦋'});
  content = {text:'Desde el dispositivo de prueba'};
  await shareClipboard(deps, 'toPC');
  assert.equal(await clipboard.readText(), content.text);
  const image = nativeImage.createFromPath(path.join(__dirname, '../desktop/icon.png')).resize({width:16,height:16});
  const source = image.toPNG();
  await clipboard.write([new ClipboardItem({'image/png':new Blob([source], {type:'image/png'})})]);
  await shareClipboard(deps, 'toPhone');
  assert(nativeImage.createFromBuffer(received).getSize().width === 16);
  await clipboard.writeText('temporary text');
  await shareClipboard(deps, 'toPC');
  const items = await clipboard.read();
  const item = items.find(item => item.types.includes('image/png'));
  assert(item, 'Native image did not reach the system clipboard');
  const restoredImage = nativeImage.createFromBuffer(Buffer.from(await (await item.getType('image/png')).arrayBuffer()));
  assert.deepEqual(restoredImage.getSize(), {width:16, height:16});
  console.log('Real Electron clipboard: async Unicode text and PNG passed in both directions.');
}).catch(error => {result = 1; console.error(error.stack);}).finally(async () => {
  try {
    if (original?.length) await clipboard.write(original);
    else if (original) await clipboard.clear();
  } catch (error) {result = 1; console.error('Could not restore clipboard:', error.message);}
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  window?.destroy();
  clearTimeout(deadline);
  app.exit(result);
});
process.on('exit', () => {try {fs.rmSync(profile, {recursive:true, force:true});}catch{}});
