const PROTOCOL = 'mirros-control-v1';

export function encodeControl(path, data, sequence) {
  const touch = path === '/touch' && ['contact', 'release'].includes(data.type);
  const key = path === '/key' && Array.isArray(data.usages);
  if (!touch && !key) return null;
  if (touch && ![data.x, data.y].every(v => Number.isInteger(v) && v >= 0 && v <= 65535)) throw new Error('Coordenadas no válidas.');
  if (key && (data.usages.length > 255 || !data.usages.every(v => Number.isInteger(v) && v >= 0 && v <= 255) || (data.detach && data.usages.length))) throw new Error('Teclas no válidas.');
  const bytes = new ArrayBuffer(touch ? 10 : 8 + data.usages.length * 2);
  const view = new DataView(bytes);
  view.setUint8(0, 1); view.setUint8(1, touch ? (data.type === 'contact' ? 1 : 2) : 3); view.setUint32(2, sequence);
  if (touch) { view.setUint16(6, data.x); view.setUint16(8, data.y); }
  else { view.setUint8(6, data.detach ? 1 : 0); view.setUint8(7, data.usages.length); data.usages.forEach((usage, i) => view.setUint16(8 + i * 2, usage)); }
  return bytes;
}

export function createTransport({WebSocket: Socket = globalThis.WebSocket, location = globalThis.location, fetch: request = globalThis.fetch, timeout = 3000} = {}) {
  let socket, opening, pending, sequence = 0, retryAt = 0, chain = Promise.resolve();
  const stats = {acknowledged: 0, httpFallbacks: 0, failures: 0, lastRoundTripMs: null, lastDispatchMs: null};
  const failure = () => new Error('Se interrumpió el control. Revisa la conexión.');
  function disconnect() {
    const previous = socket; socket = null; retryAt = Date.now() + 5000;
    if (pending) { clearTimeout(pending.timer); pending.reject(failure()); pending = null; stats.failures++; }
    previous?.close();
  }
  async function connect() {
    if (socket?.readyState === 1) return socket;
    if (opening) return opening;
    if (!Socket || !location || Date.now() < retryAt) return null;
    opening = new Promise(resolve => {
      const url = new URL('/control', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      let ws;
      try { ws = new Socket(url.href, PROTOCOL); } catch { retryAt = Date.now() + 5000; resolve(null); return; }
      socket = ws; ws.binaryType = 'arraybuffer';
      let settled = false;
      const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      const timer = setTimeout(() => { finish(null); if (socket === ws) disconnect(); }, timeout);
      ws.onopen = () => {
        if (socket !== ws || ws.protocol !== PROTOCOL) { finish(null); if (socket === ws) disconnect(); else ws.close(); return; }
        finish(ws);
      };
      ws.onmessage = ({data}) => {
        if (socket !== ws) return;
        if (!(data instanceof ArrayBuffer) || data.byteLength !== 11 || !pending) { disconnect(); return; }
        const view = new DataView(data);
        if (view.getUint8(0) !== 1 || view.getUint32(1) !== pending.sequence) { disconnect(); return; }
        const item = pending; pending = null; clearTimeout(item.timer);
        stats.lastRoundTripMs = performance.now() - item.started;
        stats.lastDispatchMs = view.getUint32(7) / 1000;
        if (view.getUint16(5) === 200) { stats.acknowledged++; item.resolve(); }
        else { stats.failures++; item.reject(failure()); }
      };
      ws.onerror = ws.onclose = () => { finish(null); if (socket === ws) disconnect(); };
    });
    try { return await opening; } finally { opening = null; }
  }
  async function http(path, data) {
    const response = await request(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: AbortSignal.timeout(timeout)});
    if (!response.ok) throw new Error('No se pudo enviar el gesto. Revisa la conexión.');
  }
  async function send(path, data) {
    const id = sequence = (sequence + 1) >>> 0;
    const bytes = encodeControl(path, data, id);
    if (!bytes) return http(path, data);
    const ws = await connect();
    if (!ws) { stats.httpFallbacks++; return http(path, data); }
    // Only one command may await an ACK. Never retry a command already sent.
    return new Promise((resolve, reject) => {
      pending = {sequence: id, resolve, reject, started: performance.now(), timer: setTimeout(disconnect, timeout)};
      try { ws.send(bytes); } catch { disconnect(); }
    });
  }
  return {
    post(path, data) { const result = chain.then(() => send(path, data)); chain = result.catch(() => {}); return result; },
    close: disconnect,
    stats: () => ({...stats, mode: socket?.readyState === 1 ? 'websocket' : 'http'}),
  };
}
const transport = createTransport();
export const post = (path, data) => transport.post(path, data);
export const controlStats = () => transport.stats();
if (globalThis.addEventListener) globalThis.addEventListener('pagehide', () => transport.close());
