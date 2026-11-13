// USB session lifecycle is independent of Electron windows.
const {spawn} = require('node:child_process');
const net = require('node:net');
const {deviceRequest} = require('./device-request.cjs');
const {stopProcess: stop, stopSession} = require('./runtime.cjs');

function createSession({workerArgs, publish, getState, writeLog, fetchRequest = fetch, spawnProcess = spawn, stopWorker = stop, endSession = stopSession}) {
  let backendPort = null, backend = null, preparing = null;
  let quitting = false, scanning = false, connecting = false, generation = 0;
  const workers = new Set();
  let paused = false;
  const publishState = publish;
  // A manual pause is user intent, independent of late worker/UI status updates.
  publish = patch => {
    if (paused && patch.phase && !['pausado', 'cerrando'].includes(patch.phase)) return;
    publishState(patch);
  };
  function spawnWorker(args, udid) {
    const [file, argv] = workerArgs(args);
    const child = spawnProcess(file, argv, {windowsHide: true, detached: process.platform !== 'win32', env: {...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', ...(udid ? {PYMOBILEDEVICE3_UDID: udid} : {})}});
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
      const deadline = setTimeout(() => { stopWorker(child).catch(error => writeLog(String(error))); reject(new Error('Request timed out')); }, timeout);
      child.stdout.on('data', data => { output += data; });
      child.on('error', error => { clearTimeout(deadline); reject(error); });
      child.on('exit', code => {
        clearTimeout(deadline);
        if (code !== 0) return reject(new Error('Could not query the iPhone'));
        try { resolve(JSON.parse(output.trim())); } catch { reject(new Error('Invalid USB response')); }
      });
    });
  }
  async function freePort() {
    return new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  }
  async function connectDevice(device) {
    if (device?.paired === false) {
      publish({phase: 'buscando', device, message: 'Unlock your iPhone and tap "Trust" to authorize this computer.'});
      return;
    }
    if (device?.developer_mode === false) {
      const suffix = device.developer_mode_revealed ? ' (option is now visible on your iPhone).' : '.';
      publish({phase: 'buscando', device, message: 'Enable Developer Mode in Settings > Privacy & Security' + suffix});
      return;
    }
    const tunnelArgs = device?.userspace_supported === false ? ['--tunnel', device.udid] : ['--userspace'];
    connecting = true;
    const token = ++generation;
    publish({phase: 'preparando', message: 'Preparing your iPhone. The first connection may take a few minutes.', device});
    try {
      preparing = spawnWorker(['prepare', ...tunnelArgs], device.udid);
      preparing.stdout.on('data', data => writeLog(data));
      const child = preparing;
      const code = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { stopWorker(child).catch(error => writeLog(String(error))); reject(new Error('Preparation took too long. Check the USB cable and try again.')); }, 600000);
        child.once('exit', code => { clearTimeout(timeout); resolve(code); });
        child.once('error', error => { clearTimeout(timeout); reject(error); });
      });
      if (preparing === child) preparing = null;
      if (quitting || token !== generation) return;
      if (code !== 0) throw new Error('Could not prepare iPhone. Unlock it, tap "Trust", and verify Developer Mode.');
      const port = await freePort();
      if (quitting || token !== generation) return;
      backendPort = port;
      backend = spawnWorker(['serve', '--bind', '127.0.0.1', '--http-port', String(backendPort), ...tunnelArgs, '--no-audio'], device.udid);
      const server = backend;
      let serverOutput = '';
      server.stdout.on('data', data => { serverOutput += data; writeLog(data); });
      server.stderr.on('data', data => { serverOutput += data; });
      server.once('exit', () => {
        if (backend === server) { backend = null; backendPort = null; if (!quitting) publish({phase: 'buscando', message: 'Connection interrupted. Waiting for your iPhone…'}); }
      });
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline && token === generation && !quitting) {
        if (server.exitCode !== null) {
          if (/camera or microphone is in use|9022/i.test(serverOutput)) {
            throw new Error('iPhone camera or microphone is in use. Close Camera or Voice Memos and click Retry.');
          }
          throw new Error('Could not start iPhone screen stream.');
        }
        try {
          const response = await fetchRequest(`http://127.0.0.1:${backendPort}/codec`, {signal: AbortSignal.timeout(8000)});
          if (response.ok) {
            const codec = await response.json();
            if (codec.codec && codec.description && token === generation && !quitting) {
              let displayWarning = '';
              if (getState().displayMode === 'aod') {
                try {
                  await deviceRequest(fetchRequest, backendPort, '/display-mode', {mode:'aod'});
                } catch {
                  displayWarning = ' Could not enable AOD standby mode.';
                  writeLog('Failed to apply AOD standby mode on connect.\n');
                }
              }
              if (token !== generation || quitting) return;
              publish({phase: 'conectado', message: 'iPhone connected via USB.' + displayWarning});
              return;
            }
          }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      throw new Error('No video stream arrived yet. Keep the iPhone unlocked and close Camera before retrying.');
    } catch (error) {
      if (token === generation && !quitting) { await stopBackend(); backend = null; backendPort = null; publish({phase: 'error', message: error.message}); }
    } finally { if (token === generation) connecting = false; }
  }
  async function stopBackend() {
    const child = backend, port = backendPort;
    backend = null; backendPort = null;
    await endSession(child, port);
  }
  async function scan() {
    const token = generation;
    if (quitting || paused || scanning || connecting || ['error', 'pausado', 'cerrando'].includes(getState().phase)) return;
    scanning = true;
    try {
      const result = await workerResult(['status']);
      if (quitting || paused || token !== generation || connecting || ['error', 'pausado', 'cerrando'].includes(getState().phase)) return;
      if (backend) {
        const device = result.devices?.find(item => item.udid === getState().device?.udid);
        let healthy = false;
        try {
          const response = await fetchRequest(`http://127.0.0.1:${backendPort}/health`, {signal: AbortSignal.timeout(3000)});
          healthy = response.ok && (await response.json()).healthy === true;
        } catch {}
        if (quitting || token !== generation) return;
        if (!device || result.usb_error || !healthy) {
          const reset = ++generation;
          connecting = true;
          publish({phase:'buscando', message:'USB session interrupted. Reconnecting…'});
          try { await stopBackend(); }
          finally { if (reset === generation) connecting = false; }
          if (quitting || reset !== generation) return;
          if (device && !result.usb_error) await connectDevice(device);
          else publish({phase:'buscando', device:null, message:'Connect your iPhone via USB and unlock it.'});
        }
      } else if (result.usb_error) {
        publish({phase:'buscando', message:process.platform === 'win32' ? 'Check Apple Mobile Device Service via Apple Devices or iTunes.' : 'usbmuxd is not responding. Check the USB service.'});
      } else if (result.devices.length === 1) await connectDevice(result.devices[0]);
      else if (result.devices.length > 1) publish({phase: 'seleccion', devices: result.devices, message: 'Select the iPhone you want to use.'});
      else publish({phase: 'buscando', device: null, message: result.usb_error ? 'Apple USB service is not responding. Open Apple Devices or iTunes and retry.' : 'Connect your iPhone via USB and unlock it.'});
    } catch { if (!quitting && token === generation) publish({phase: 'buscando', message: 'Searching for your iPhone via USB…'}); }
    finally { scanning = false; }
  }

  async function disconnect() {
    paused = true; ++generation; connecting = true;
    publish({phase:'cerrando', message:'Releasing keyboard and ending session…'});
    try { await stopWorker(preparing); preparing = null; await stopBackend(); }
    finally { connecting = false; }
    publish({phase:'pausado', message:'Session ended. You may unplug the cable or click Retry to reconnect.'});
  }
  async function retry() {
    await disconnect();
    if (quitting) return;
    paused = false;
    publish({phase:'buscando', message:'Reconnecting…'});
    await scan();
  }
  async function select(udid) {
    if (quitting || paused || connecting || getState().phase !== 'seleccion') return;
    const device = getState().devices?.find(item => item.udid === udid);
    if (device) await connectDevice(device);
  }
  async function close() {
    quitting = true; ++generation;
    await Promise.allSettled([stopWorker(preparing), stopBackend(), ...[...workers].map(child => stopWorker(child))]);
  }
  async function diagnostics() {
    return await workerResult(['diagnostics'], 15000);
  }
  return {scan, disconnect, retry, select, close, diagnostics, get port() {return backendPort;}};
}
module.exports = {createSession};
