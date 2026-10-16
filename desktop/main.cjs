const {app, BrowserWindow, ipcMain, screen, dialog, shell, clipboard, nativeImage} = require('electron');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const {shareClipboard} = require('./clipboard.cjs');
const {workerArgs: buildWorkerArgs, stopProcess: stop, stopSession, resizeBounds, orientedBounds} = require('./runtime.cjs');

app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.env.MIRROS_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.MIRROS_DEBUG_PORT);
if (process.env.MIRROS_TEST_PROFILE) app.setPath('userData', process.env.MIRROS_TEST_PROFILE);
if (!app.requestSingleInstanceLock()) { app.quit(); }
else { app.whenReady().then(start).catch(error => { dialog.showErrorBox('No se pudo abrir Mirros', error.message); app.quit(); }); }

let window, proxyServer, guiPort, backendPort, backend, preparing, logStream, timer;
let quitting = false, switching = false, scanning = false, connecting = false, generation = 0;
let preferences = {alwaysOnTop: false, mode: 'studio', size: 'mediano', theme: 'claro', floatingBounds: null, controlsVisible: true};
let resizing = null;
let state = {phase: 'buscando', message: 'Conecta tu iPhone por USB', device: null, ...preferences};
let aspectRatio = 1264 / 2752;
const root = path.resolve(__dirname, '..');
const routes = new Set(['/codec', '/stream.bin', '/audio.bin', '/touch', '/key', '/button', '/rotate', '/orientation', '/restart', '/pli', '/clipboard']);
const assets = new Map([['/', ['index.html', 'text/html']], ['/viewer.js', ['viewer.js', 'application/javascript']], ['/viewer.css', ['viewer.css', 'text/css']]]);

function publish(patch = {}) {
  state = {...state, ...patch, ...preferences};
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('mirros:state', state);
}
function savePreferences() {
  fs.writeFileSync(path.join(app.getPath('userData'), 'preferencias.json'), JSON.stringify(preferences));
}
function workerArgs(args) {
  return buildWorkerArgs({packaged: app.isPackaged, resourcesPath: process.resourcesPath, root, desktopPath: __dirname}, args);
}
function spawnWorker(args, udid) {
  const [file, argv] = workerArgs(args);
  const child = spawn(file, argv, {windowsHide: true, detached: process.platform !== 'win32', env: {...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', ...(udid ? {PYMOBILEDEVICE3_UDID: udid} : {})}});
  child.stderr.on('data', data => logStream?.write(data));
  child.on('error', error => logStream?.write(error.stack + '\n'));
  return child;
}
function workerResult(args, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawnWorker(args);
    let output = '';
    const deadline = setTimeout(() => { stop(child); reject(new Error('Tiempo de espera agotado')); }, timeout);
    child.stdout.on('data', data => { output += data; });
    child.on('error', error => { clearTimeout(deadline); reject(error); });
    child.on('exit', code => {
      clearTimeout(deadline);
      if (code !== 0) return reject(new Error('No se pudo consultar el iPhone'));
      try { resolve(JSON.parse(output.trim())); } catch { reject(new Error('Respuesta USB no válida')); }
    });
  });
}
async function freePort() {
  return new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
}
async function connectDevice(device) {
  connecting = true;
  const token = ++generation;
  publish({phase: 'preparando', message: 'Preparando tu iPhone. La primera conexión puede tardar unos minutos.', device});
  try {
    preparing = spawnWorker(['prepare', '--userspace'], device.udid);
    preparing.stdout.on('data', data => logStream.write(data));
    const child = preparing;
    const code = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { stop(child); reject(new Error('La preparación tardó demasiado. Revisa la conexión y vuelve a intentarlo.')); }, 600000);
      child.once('exit', code => { clearTimeout(timeout); resolve(code); });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
    });
    if (preparing === child) preparing = null;
    if (quitting || token !== generation) return;
    if (code !== 0) throw new Error('No se pudo preparar el iPhone. Desbloquéalo, acepta «Confiar» y verifica el Modo Desarrollador.');
    backendPort = await freePort();
    backend = spawnWorker(['serve', '--bind', '127.0.0.1', '--http-port', String(backendPort), '--userspace', '--no-audio'], device.udid);
    const server = backend;
    server.stdout.on('data', data => logStream.write(data));
    server.once('exit', () => {
      if (backend === server) { backend = null; backendPort = null; if (!quitting) publish({phase: 'buscando', message: 'La conexión se interrumpió. Esperando tu iPhone…'}); }
    });
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && token === generation && !quitting) {
      if (server.exitCode !== null) throw new Error('No se pudo iniciar la pantalla del iPhone.');
      try {
        const response = await fetch(`http://127.0.0.1:${backendPort}/codec`, {signal: AbortSignal.timeout(8000)});
        if (response.ok) {
          const codec = await response.json();
          if (codec.codec && codec.description && token === generation && !quitting) { publish({phase: 'conectado', message: 'iPhone conectado por USB.'}); return; }
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Todavía no llega video. Mantén el iPhone desbloqueado y cierra Cámara antes de reintentar.');
  } catch (error) {
    if (token === generation && !quitting) { await stopBackend(); backend = null; backendPort = null; publish({phase: 'error', message: error.message}); }
  } finally { if (token === generation) connecting = false; }
}
async function stopBackend() {
  const child = backend, port = backendPort;
  backend = null; backendPort = null;
  await stopSession(child, port);
}
async function scan() {
  if (quitting || scanning || connecting || ['error', 'pausado', 'cerrando'].includes(state.phase)) return;
  scanning = true;
  try {
    const result = await workerResult(['status']);
    if (quitting || connecting || ['pausado', 'cerrando'].includes(state.phase)) return;
    if (result.usb_error) {
      if (!backend) publish({phase: 'buscando', message: process.platform === 'win32' ? 'Revisa el servicio USB de Apple en Dispositivos Apple o iTunes.' : 'No responde usbmuxd. Comprueba el servicio USB.'});
      return;
    }
    if (backend) {
      if (!result.devices.some(item => item.udid === state.device?.udid)) {
        ++generation; await stopBackend(); backend = null; backendPort = null;
        publish({phase: 'buscando', device: null, message: 'Se desconectó el iPhone. Vuelve a conectarlo por USB.'});
      }
    } else if (result.devices.length === 1) await connectDevice(result.devices[0]);
    else if (result.devices.length > 1) publish({phase: 'seleccion', devices: result.devices, message: 'Elige el iPhone que quieres usar.'});
    else publish({phase: 'buscando', device: null, message: result.usb_error ? 'No responde el servicio USB de Apple. Abre Dispositivos Apple o iTunes y vuelve a intentar.' : 'Conecta tu iPhone por USB y desbloquéalo.'});
  } catch { if (!quitting) publish({phase: 'buscando', message: 'Buscando tu iPhone por USB…'}); }
  finally { scanning = false; }
}
function floatingInsets() { return {insetX: preferences.controlsVisible ? 78 : 42, insetY: 28}; }
function floatingSize(size = preferences.size) {
  const {insetX, insetY} = floatingInsets();
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workAreaSize;
  const height = Math.floor(Math.min({pequeño: 460, mediano: 620, grande: 820}[size] || 620, area.height - 32, (area.width - insetX - 32) / aspectRatio + insetY));
  return [Math.max(240, Math.ceil((height - insetY) * aspectRatio + insetX)), Math.max(360, height)];
}
function createWindow() {
  const floating = preferences.mode === 'phone';
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const saved = preferences.floatingBounds;
  const [width, height] = floating ? (saved ? [Math.max(240, Math.min(saved.width, workArea.width - 16)), Math.max(360, Math.min(saved.height, workArea.height - 16))] : floatingSize()) : [Math.min(1120, workArea.width - 32), Math.min(800, workArea.height - 32)];
  const previous = window;
  switching = true;
  const win = new BrowserWindow({width, height, minWidth: floating ? 240 : 760, minHeight: floating ? 360 : 540,
    title: 'Mirros', icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'), frame: false, transparent: floating,
    backgroundColor: floating ? '#00000000' : '#edf0f5', hasShadow: !floating, resizable: !floating,
    alwaysOnTop: preferences.alwaysOnTop, show: false, autoHideMenuBar: true,
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false}});
  window = win;
  resizing = null;
  let resizeTimer;
  win.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window !== win || win.isDestroyed() || preferences.mode !== 'phone') return;
      const {width, height} = win.getBounds(); preferences.floatingBounds = {width, height}; savePreferences(); publish();
    }, 200);
  });
  win.once('closed', () => clearTimeout(resizeTimer));
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`http://127.0.0.1:${guiPort}/`)) event.preventDefault(); });
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.once('ready-to-show', () => { win.show(); if (previous && !previous.isDestroyed()) previous.destroy(); switching = false; publish(); });
  win.on('closed', () => { if (window === win) { window = null; if (!switching) app.quit(); } });
  win.loadURL(`http://127.0.0.1:${guiPort}/`);
}
async function start() {
  fs.mkdirSync(app.getPath('userData'), {recursive: true});
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'preferencias.json')));
    const bounds = saved.floatingBounds;
    const floatingBounds = bounds && Number.isFinite(bounds.width) && Number.isFinite(bounds.height) && bounds.width >= 240 && bounds.width <= 8192 && bounds.height >= 360 && bounds.height <= 8192 ? {width: Math.round(bounds.width), height: Math.round(bounds.height)} : null;
    preferences = {alwaysOnTop: saved.alwaysOnTop === true, mode: saved.mode === 'phone' ? 'phone' : 'studio', size: ['pequeño', 'mediano', 'grande'].includes(saved.size) ? saved.size : 'mediano', theme: ['claro', 'oscuro', 'lavanda', 'oceano', 'sistema'].includes(saved.theme) ? saved.theme : 'claro', floatingBounds, controlsVisible: saved.controlsVisible !== false};
  } catch {}
  logStream = fs.createWriteStream(path.join(app.getPath('userData'), 'mirros.log'), {flags: 'a'});
  const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(root, 'src', 'ios_scrcpy', 'web');
  if (!fs.existsSync(path.join(webRoot, 'index.html'))) throw new Error('Falta la interfaz. Ejecuta npm run build antes de abrir Mirros.');
  proxyServer = http.createServer((req, res) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; }
    catch { res.writeHead(400); res.end(); return; }
    const host = `127.0.0.1:${guiPort}`;
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) { res.writeHead(403); res.end(); return; }
    if (assets.has(pathname) && req.method === 'GET') {
      const [file, type] = assets.get(pathname);
      res.writeHead(200, {'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
      const asset = fs.createReadStream(path.join(webRoot, file));
      asset.on('error', () => res.destroy()); asset.pipe(res); return;
    }
    if (!routes.has(pathname)) { res.writeHead(404); res.end(); return; }
    if (!backendPort) { res.writeHead(503); res.end('Esperando iPhone'); return; }
    const headers = {...req.headers, host: `127.0.0.1:${backendPort}`}; delete headers.origin;
    const proxy = http.request({hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers}, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
    proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    res.on('close', () => proxy.destroy()); req.pipe(proxy);
  });
  await new Promise((resolve, reject) => { proxyServer.once('error', reject); proxyServer.listen(0, '127.0.0.1', resolve); });
  guiPort = proxyServer.address().port;
  ipcMain.handle('mirros:state', () => ({...state, alwaysOnTop: window?.isAlwaysOnTop() ?? preferences.alwaysOnTop}));
  ipcMain.handle('mirros:action', async (event, name, value) => {
    if (event.sender !== window?.webContents) throw new Error('Ventana no autorizada');
    switch (name) {
      case 'pin': preferences.alwaysOnTop = value === true; window.setAlwaysOnTop(preferences.alwaysOnTop, 'floating'); break;
      case 'theme': if (['claro', 'oscuro', 'lavanda', 'oceano', 'sistema'].includes(value)) preferences.theme = value; break;
      case 'mode': preferences.mode = value === 'phone' ? 'phone' : 'studio'; createWindow(); break;
      case 'size': if (['pequeño', 'mediano', 'grande'].includes(value)) { preferences.size = value; preferences.floatingBounds = null; if (preferences.mode === 'phone') window.setSize(...floatingSize()); } break;
      case 'controls': {
        const previous = floatingInsets().insetX; preferences.controlsVisible = value !== false;
        if (preferences.mode === 'phone') {
          const bounds = window.getBounds();
          window.setSize(Math.max(240, bounds.width + floatingInsets().insetX - previous), bounds.height);
          const {width, height} = window.getBounds(); preferences.floatingBounds = {width, height};
        }
        break;
      }
      case 'fitHeight': {
        if (preferences.mode !== 'phone') { window.maximize(); return; }
        const area = screen.getDisplayMatching(window.getBounds()).workArea;
        const {insetX, insetY} = floatingInsets();
        const phoneHeight = Math.min(area.height - insetY, (area.width - insetX) / aspectRatio);
        const width = Math.max(240, Math.round(phoneHeight * aspectRatio + insetX)), height = Math.round(phoneHeight + insetY);
        window.setBounds({x: Math.round(area.x + (area.width - width) / 2), y: area.y, width, height});
        preferences.floatingBounds = {width, height}; break;
      }
      case 'dimensions': {
        if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width / value.height <= 0.2 || value.width / value.height >= 5) return;
        const previousRatio = aspectRatio; aspectRatio = value.width / value.height;
        if (preferences.mode === 'phone' && !resizing && Math.abs(aspectRatio - previousRatio) > .01) {
          const bounds = window.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
          window.setBounds(orientedBounds(bounds, previousRatio, aspectRatio, area, floatingInsets().insetX, floatingInsets().insetY));
          const {width, height} = window.getBounds(); preferences.floatingBounds = {width, height}; savePreferences(); publish();
        }
        return;
      }
      case 'resizeStart': {
        if (preferences.mode !== 'phone' || !value || !['n','s','e','w','ne','nw','se','sw'].includes(value.edge) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
        resizing = {edge: value.edge, x: value.x, y: value.y, bounds: window.getBounds()}; return;
      }
      case 'resizeMove': {
        if (!resizing || !value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
        const area = screen.getDisplayMatching(resizing.bounds).workArea;
        window.setBounds(resizeBounds(resizing.bounds, resizing.edge, value.x - resizing.x, value.y - resizing.y, {aspectRatio, ...floatingInsets(), maxWidth: area.width, maxHeight: area.height, minX: area.x, minY: area.y, maxX: area.x + area.width, maxY: area.y + area.height})); return;
      }
      case 'resizeEnd': {
        if (resizing && preferences.mode === 'phone') {
          const {width, height} = window.getBounds(); preferences.floatingBounds = {width, height}; savePreferences(); publish();
        }
        resizing = null; return;
      }
      case 'minimize': window.minimize(); return;
      case 'maximize': window.isMaximized() ? window.unmaximize() : window.maximize(); return;
      case 'close': app.quit(); return;
      case 'clipboard': return shareClipboard({clipboard, nativeImage, fetch, backendPort: state.phase === 'conectado' ? backendPort : null}, value);
      case 'disconnect': ++generation; connecting = true; publish({phase: 'cerrando', message: 'Liberando teclado y terminando la sesión…'}); await stop(preparing); preparing = null; await stopBackend(); connecting = false; publish({phase: 'pausado', message: 'Sesión terminada. Ya puedes retirar el cable; pulsa Reconectar para volver.'}); return;
      case 'retry': ++generation; await stop(preparing); await stopBackend(); preparing = backend = null; backendPort = null; connecting = false; publish({phase: 'buscando', message: 'Volviendo a conectar…'}); scan(); return;
      case 'device': if (state.phase === 'seleccion' && !connecting) { const selected = state.devices?.find(item => item.udid === value); if (selected) connectDevice(selected); } return;
      case 'saveCapture': {
        if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,') || value.length > 30 * 1024 * 1024) throw new Error('Captura no válida');
        const result = await dialog.showSaveDialog(window, {title: 'Guardar captura del iPhone', defaultPath: `Mirros-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, filters: [{name: 'Imagen PNG', extensions: ['png']}]});
        if (!result.canceled && result.filePath) fs.writeFileSync(result.filePath, Buffer.from(value.split(',')[1], 'base64'));
        return !result.canceled;
      }
      case 'logs': shell.showItemInFolder(path.join(app.getPath('userData'), 'mirros.log')); return;
      default: throw new Error('Acción no válida');
    }
    savePreferences(); publish();
  });
  createWindow(); scan(); timer = setInterval(scan, 5000);
}
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true; ++generation; clearInterval(timer);
  Promise.all([stop(preparing), stopBackend()]).finally(() => { proxyServer?.close(); logStream?.end(); app.exit(0); });
});
