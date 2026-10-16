const {app, BrowserWindow, ipcMain, screen, dialog, shell, clipboard, ClipboardItem, nativeImage} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {waylandClipboard} = require('./wayland-clipboard.cjs');
const systemClipboard = waylandClipboard(clipboard, ClipboardItem);
const {shareClipboard, clipboardShortcut} = require('./clipboard.cjs');
const updates = require('./updates.cjs');
const {createSession} = require('./session.cjs');
const {workerArgs: buildWorkerArgs, resizeBounds, orientedBounds} = require('./runtime.cjs');

app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.env.MIRROS_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.MIRROS_DEBUG_PORT);
if (process.env.MIRROS_TEST_PROFILE) app.setPath('userData', process.env.MIRROS_TEST_PROFILE);
if (!app.requestSingleInstanceLock()) { app.quit(); }
else { app.whenReady().then(start).catch(error => { exitCode = 1; dialog.showErrorBox('No se pudo abrir Mirros', error.message); app.quit(); }); }

let window, proxyServer, guiPort, logStream, timer, session;
let quitting = false, switching = false;
let exitCode = 0;
let preferences = {alwaysOnTop: false, mode: 'studio', size: 'mediano', theme: 'claro', floatingBounds: null, controlsVisible: true};
let resizing = null, updateAsset = null, updateBusy = false, installUpdate = null;
const version = app.getVersion();
async function checkForUpdates() {
  if (updateBusy) return; updateBusy = true;
  publish({update:{phase:'comprobando',message:'Comprobando GitHub…'}});
  try { const result = await updates.checkUpdates({version}); updateAsset = result.asset || null; const {asset, ...status} = result; publish({update:status}); }
  catch(error) { publish({update:{phase:'error',message:error.message}}); }
  finally { updateBusy = false; }
}
let state = {phase: 'buscando', message: 'Conecta tu iPhone por USB', device: null, version:app.getVersion(), update:{phase:'inactivo',message:'Actualizaciones desde GitHub'}, ...preferences};
let aspectRatio = 1264 / 2752;
const root = path.resolve(__dirname, '..');
const routes = new Set(['/codec', '/stream.bin', '/frames.bin', '/audio.bin', '/touch', '/key', '/button', '/rotate', '/orientation', '/restart', '/pli', '/clipboard']);
const assets = new Map([['/', ['index.html', 'text/html']], ['/viewer.js', ['viewer.js', 'application/javascript']], ['/viewer.css', ['viewer.css', 'text/css']]]);

function publish(patch = {}) {
  state = {...state, ...patch, ...preferences};
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('mirros:state', state);
}
function savePreferences() {
  fs.writeFileSync(path.join(app.getPath('userData'), 'preferencias.json'), JSON.stringify(preferences));
}
function floatingInsets() { return {insetX: preferences.controlsVisible ? 78 : 42, insetY: 28}; }
function floatingSize(size = preferences.size) {
  const {insetX, insetY} = floatingInsets();
  const area = (window && !window.isDestroyed() ? screen.getDisplayMatching(window.getBounds()) : screen.getPrimaryDisplay()).workAreaSize;
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
  session = createSession({
    workerArgs: args => buildWorkerArgs({packaged: app.isPackaged, resourcesPath: process.resourcesPath, root, desktopPath: __dirname}, args),
    publish, getState: () => state, writeLog: data => logStream.write(data),
  });
  const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(root, 'src', 'mirros', 'web');
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
    const backendPort = session.port;
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
      case 'updatesCheck': await checkForUpdates(); return;
      case 'updatesDownload': {
        if (updateBusy || !updateAsset) return; updateBusy = true;
        try {
          const directory = path.join(app.getPath('userData'), 'updates');
          publish({update:{phase:'descargando',message:'Descargando actualización…',progress:0}});
          const file = await updates.downloadUpdate(updateAsset, directory, {onProgress:progress=>publish({update:{phase:'descargando',message:'Descargando actualización…',progress}})});
          const target = updates.portableTarget(process.platform);
          if (!target) throw new Error('Abre el EXE portátil o el AppImage para instalar la actualización.');
          const install = await updates.prepareInstaller({target,download:file,directory,hash:updateAsset.hash});
          installUpdate = install;
          publish({update:{phase:'lista',message:'Descarga verificada. Lista para instalar al reiniciar.'}});
        } catch(error) { publish({update:{phase:'error',message:error.message}}); }
        finally { updateBusy = false; }
        return;
      }
      case 'updatesInstall': if (installUpdate) { try { await installUpdate(); app.quit(); } catch(error) { publish({update:{phase:'error',message:'No se pudo iniciar la instalación: '+error.message}}); } } return;
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
      case 'clipboard': {
        try { return await shareClipboard({clipboard:systemClipboard, ClipboardItem, nativeImage, fetch, backendPort: state.phase === 'conectado' ? session.port : null}, value); }
        catch (error) { logStream.write(`[clipboard] ${value}: ${error.message}\n`); throw error; }
      }
      case 'clipboardShortcut': {
        try { return await clipboardShortcut({clipboard:systemClipboard, ClipboardItem, nativeImage, fetch, backendPort: state.phase === 'conectado' ? session.port : null}, value); }
        catch (error) { logStream.write(`[clipboard-shortcut] ${value}: ${error.message}\n`); throw error; }
      }
      case 'disconnect': await session.disconnect(); return;
      case 'retry': await session.retry(); return;
      case 'device': await session.select(value); return;
      case 'logs': shell.showItemInFolder(path.join(app.getPath('userData'), 'mirros.log')); return;
      default: throw new Error('Acción no válida');
    }
    savePreferences(); publish();
  });
  createWindow(); session.scan(); timer = setInterval(() => session.scan(), 5000); setTimeout(checkForUpdates, 5000).unref(); setInterval(checkForUpdates, 6*60*60*1000).unref();
}
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true; clearInterval(timer);
  Promise.resolve(session?.close()).finally(() => { proxyServer?.close(); logStream?.end(); app.exit(exitCode); });
});
