// USB session lifecycle is independent of Electron windows.
const {spawn} = require('node:child_process');
const net = require('node:net');
const {stopProcess: stop, stopSession} = require('./runtime.cjs');

function createSession({workerArgs, publish, getState, writeLog}) {
  let backendPort = null, backend = null, preparing = null;
  let quitting = false, scanning = false, connecting = false, generation = 0;
  const workers = new Set();
  function spawnWorker(args, udid) {
    const [file, argv] = workerArgs(args);
    const child = spawn(file, argv, {windowsHide: true, detached: process.platform !== 'win32', env: {...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', ...(udid ? {PYMOBILEDEVICE3_UDID: udid} : {})}});
    child.mirrosProcessGroup = process.platform !== 'win32';
    child.stderr.on('data', data => writeLog(data));
    child.on('error', error => writeLog(error.stack + '\n'));
    return child;
  }
  function workerResult(args, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const child = spawnWorker(args);
      workers.add(child); child.once('exit', () => workers.delete(child));
      let output = '';
      const deadline = setTimeout(() => { stop(child).catch(error => writeLog(String(error))); reject(new Error('Tiempo de espera agotado')); }, timeout);
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
      preparing.stdout.on('data', data => writeLog(data));
      const child = preparing;
      const code = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { stop(child).catch(error => writeLog(String(error))); reject(new Error('La preparación tardó demasiado. Revisa la conexión y vuelve a intentarlo.')); }, 600000);
        child.once('exit', code => { clearTimeout(timeout); resolve(code); });
        child.once('error', error => { clearTimeout(timeout); reject(error); });
      });
      if (preparing === child) preparing = null;
      if (quitting || token !== generation) return;
      if (code !== 0) throw new Error('No se pudo preparar el iPhone. Desbloquéalo, acepta «Confiar» y verifica el Modo Desarrollador.');
      const port = await freePort();
      if (quitting || token !== generation) return;
      backendPort = port;
      backend = spawnWorker(['serve', '--bind', '127.0.0.1', '--http-port', String(backendPort), '--userspace', '--no-audio'], device.udid);
      const server = backend;
      server.stdout.on('data', data => writeLog(data));
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
    const token = generation;
    if (quitting || scanning || connecting || ['error', 'pausado', 'cerrando'].includes(getState().phase)) return;
    scanning = true;
    try {
      const result = await workerResult(['status']);
      if (quitting || token !== generation || connecting || ['error', 'pausado', 'cerrando'].includes(getState().phase)) return;
      if (result.usb_error) {
        if (!backend) publish({phase: 'buscando', message: process.platform === 'win32' ? 'Revisa el servicio USB de Apple en Dispositivos Apple o iTunes.' : 'No responde usbmuxd. Comprueba el servicio USB.'});
        return;
      }
      if (backend) {
        if (!result.devices.some(item => item.udid === getState().device?.udid)) {
          ++generation; await stopBackend(); backend = null; backendPort = null;
          publish({phase: 'buscando', device: null, message: 'Se desconectó el iPhone. Vuelve a conectarlo por USB.'});
        }
      } else if (result.devices.length === 1) await connectDevice(result.devices[0]);
      else if (result.devices.length > 1) publish({phase: 'seleccion', devices: result.devices, message: 'Elige el iPhone que quieres usar.'});
      else publish({phase: 'buscando', device: null, message: result.usb_error ? 'No responde el servicio USB de Apple. Abre Dispositivos Apple o iTunes y vuelve a intentar.' : 'Conecta tu iPhone por USB y desbloquéalo.'});
    } catch { if (!quitting) publish({phase: 'buscando', message: 'Buscando tu iPhone por USB…'}); }
    finally { scanning = false; }
  }

  async function disconnect() {
    ++generation; connecting = true;
    publish({phase:'cerrando', message:'Liberando teclado y terminando la sesión…'});
    try { await stop(preparing); preparing = null; await stopBackend(); }
    finally { connecting = false; }
    publish({phase:'pausado', message:'Sesión terminada. Ya puedes retirar el cable; pulsa Reconectar para volver.'});
  }
  async function retry() {
    await disconnect();
    if (quitting) return;
    publish({phase:'buscando', message:'Volviendo a conectar…'});
    await scan();
  }
  async function select(udid) {
    if (quitting || connecting || getState().phase !== 'seleccion') return;
    const device = getState().devices?.find(item => item.udid === udid);
    if (device) await connectDevice(device);
  }
  async function close() {
    quitting = true; ++generation;
    await Promise.allSettled([stop(preparing), stopBackend(), ...[...workers].map(child => stop(child))]);
  }
  return {scan, disconnect, retry, select, close, get port() {return backendPort;}};
}
module.exports = {createSession};
