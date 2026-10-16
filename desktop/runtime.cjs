const path = require('node:path');
const {execFile} = require('node:child_process');

function workerArgs({platform = process.platform, packaged, resourcesPath, root, desktopPath}, args) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (packaged) return [paths.join(resourcesPath, 'backend', platform === 'win32' ? 'mirros-backend.exe' : 'mirros-backend'), args];
  const python = platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
  return [paths.join(root, '.venv', ...python), [paths.join(desktopPath, 'worker.py'), ...args]];
}

async function stopProcess(child, platform = process.platform) {
  if (!child?.pid) return;
  const running = child.exitCode === null && child.signalCode == null;
  if (!running && !child.mirrosProcessGroup) return;
  if (platform === 'win32') {
    if (!running) return;
    await new Promise(resolve => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, timeout: 5000}, resolve));
    return;
  }
  // Workers have their own process group; terminate their descendants too.
  const signal = name => {
    try { process.kill(-child.pid, name); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  let onExit;
  const exited = running ? new Promise(resolve => {onExit = resolve; child.once('exit', onExit);}) : Promise.resolve();
  signal('SIGTERM');
  let timer;
  await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 2000); })]);
  clearTimeout(timer);
  signal('SIGKILL');
  if (onExit) child.removeListener('exit', onExit);
}

async function stopSession(child, port, {fetchRequest = fetch, forceStop = stopProcess, graceMs = 30000} = {}) {
  if (!child) return;
  if (port && child.exitCode === null) {
    try {
      const response = await fetchRequest(`http://127.0.0.1:${port}/session/end`, {method: 'POST', signal: AbortSignal.timeout(1800)});
      if (response.ok && child.exitCode === null) {
        let timeout, onExit;
        await Promise.race([new Promise(resolve => { onExit = resolve; child.once('exit', onExit); }), new Promise(resolve => { timeout = setTimeout(resolve, graceMs); })]);
        clearTimeout(timeout); child.removeListener('exit', onExit);
      }
    } catch { /* USB may already be disconnected. */ }
  }
  await forceStop(child);
}

function resizeBounds(bounds, edge, dx, dy, limits = {}) {
  const {minWidth = 240, minHeight = 360, maxWidth = 8192, maxHeight = 8192} = limits;
  const result = {...bounds};
  const clamp = (n, min, max) => Math.max(min, Math.min(max, Math.round(n)));
  if (limits.aspectRatio > 0) {
    const insetX = limits.insetX ?? 78, insetY = limits.insetY ?? 28;
    const ratio = limits.aspectRatio;
    const currentHeight = Math.min(bounds.height - insetY, (bounds.width - insetX) / ratio);
    const horizontal = edge.includes('e') ? dx / ratio : edge.includes('w') ? -dx / ratio : 0;
    const vertical = edge.includes('s') ? dy : edge.includes('n') ? -dy : 0;
    const change = Math.abs(horizontal) > Math.abs(vertical) ? horizontal : vertical;
    const phoneHeight = clamp(currentHeight + change, minHeight - insetY, Math.min(maxHeight - insetY, (maxWidth - insetX) / ratio));
    result.width = Math.max(minWidth, Math.round(phoneHeight * ratio + insetX));
    result.height = phoneHeight + insetY;
    result.x = edge.includes('w') ? bounds.x + bounds.width - result.width : edge.includes('e') ? bounds.x : bounds.x + (bounds.width - result.width) / 2;
    result.y = edge.includes('n') ? bounds.y + bounds.height - result.height : edge.includes('s') ? bounds.y : bounds.y + (bounds.height - result.height) / 2;
    result.x = Math.round(Math.max(limits.minX ?? -Infinity, Math.min(limits.maxX == null ? Infinity : limits.maxX - result.width, result.x)));
    result.y = Math.round(Math.max(limits.minY ?? -Infinity, Math.min(limits.maxY == null ? Infinity : limits.maxY - result.height, result.y)));
    return result;
  }
  if (edge.includes('e')) result.width = clamp(bounds.width + dx, minWidth, maxWidth);
  if (edge.includes('w')) { result.width = clamp(bounds.width - dx, minWidth, maxWidth); result.x = bounds.x + bounds.width - result.width; }
  if (edge.includes('s')) result.height = clamp(bounds.height + dy, minHeight, maxHeight);
  if (edge.includes('n')) { result.height = clamp(bounds.height - dy, minHeight, maxHeight); result.y = bounds.y + bounds.height - result.height; }
  return result;
}

function orientedBounds(bounds, previousRatio, ratio, area, insetX = 78, insetY = 28) {
  const oldHeight = Math.min(bounds.height - insetY, (bounds.width - insetX) / previousRatio);
  const wantedHeight = Math.sqrt(oldHeight * oldHeight * previousRatio / ratio);
  const height = Math.round(Math.max(332, Math.min(wantedHeight, area.height - insetY, (area.width - insetX) / ratio)));
  const width = Math.max(240, Math.round(height * ratio + insetX));
  return {width, height: height + insetY,
    x: Math.round(Math.max(area.x, Math.min(area.x + area.width - width, bounds.x + (bounds.width - width) / 2))),
    y: Math.round(Math.max(area.y, Math.min(area.y + area.height - height - insetY, bounds.y + (bounds.height - height - insetY) / 2)))};
}

module.exports = {workerArgs, stopProcess, stopSession, resizeBounds, orientedBounds};
