export const clamp = (value, min = 0, max = 65535) => Math.max(min, Math.min(max, Math.round(value)));
export function coordinates(clientX, clientY, rect) {
  if (!(rect.width > 0 && rect.height > 0)) return null;
  return {x: clamp((clientX - rect.left) / rect.width * 65535), y: clamp((clientY - rect.top) / rect.height * 65535)};
}
export function wheelPath(point, delta, sensitivity = 1, viewSize = 650, horizontal = false) {
  const distance = Math.min(22000, Math.abs(delta) / Math.max(1, viewSize) * 65535 * sensitivity);
  const direction = Math.sign(delta);
  const fixed = clamp(horizontal ? point.y : point.x, 6000, 59535);
  const center = clamp(horizontal ? point.x : point.y, 16000, 49535);
  const first = clamp(center + direction * distance / 2, 5000, 60535);
  const last = clamp(center - direction * distance / 2, 5000, 60535);
  return horizontal ? {start: {x: first, y: fixed}, end: {x: last, y: fixed}} : {start: {x: fixed, y: first}, end: {x: fixed, y: last}};
}
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
export function createInput(send, onError = () => {}, {getSize = () => ({width: 300, height: 650})} = {}) {
  let chain = Promise.resolve(), active = null, scheduled = null, disposed = false;
  let wheelDelta = 0, wheelPoint = {x: 32768, y: 32768}, wheelTimer = null, wheelBusy = false, wheelSize = 650, sensitivity = 1, horizontal = false, gestureToken = 0;
  const enqueue = task => { chain = chain.then(task).catch(onError); return chain; };
  const contact = point => disposed ? Promise.resolve() : send('/touch', {type: 'contact', x: point.x, y: point.y});
  const lift = point => send('/touch', {type: 'release', x: point.x, y: point.y});
  const distance = (session, point) => Math.hypot((point.x - session.start.x) / 65535 * session.size.width, (point.y - session.start.y) / 65535 * session.size.height);
  function flushMove(session = active) {
    scheduled = null;
    if (!session?.pending) return;
    if (!session.dragged && distance(session, session.pending) < 3) return;
    session.dragged = true;
    // At most one waiting move per finger. Slow HTTP never builds a stale path.
    if (session.moveQueued) return;
    session.moveQueued = true;
    enqueue(async () => {
      session.moveQueued = false;
      const point = session.pending; session.pending = null;
      if (point && (point.x !== session.last.x || point.y !== session.last.y)) {
        session.last = point;
        await contact(point);
      }
    });
  }
  function release(id, point) {
    const session = active;
    if (!session || (id != null && id !== session.id)) return chain;
    if (scheduled != null) { cancelAnimationFrame(scheduled); scheduled = null; }
    if (point) session.pending = point;
    flushMove(session);
    active = null;
    const end = session.dragged ? (session.pending || point || session.last) : session.start;
    enqueue(async () => {
      // Tap dwell starts when the down is sent, not when it waited in the queue.
      const minimum = session.dragged ? 16 : 40;
      await sleep(Math.max(0, minimum - (performance.now() - session.sentAt)));
      await lift(end);
    });
    return chain;
  }
  async function gesture(start, end, duration, token) {
    let final = start;
    const began = performance.now();
    try {
      await contact(start);
      while (!disposed && token === gestureToken) {
        const elapsed = performance.now() - began;
        if (elapsed < duration) await sleep(Math.min(12, duration - elapsed));
        if (disposed || token !== gestureToken) break;
        const progress = Math.min(1, (performance.now() - began) / duration);
        final = {x: clamp(start.x + (end.x - start.x) * progress), y: clamp(start.y + (end.y - start.y) * progress)};
        await contact(final);
        if (progress === 1) break;
      }
    } finally { await lift(final); }
  }
  async function drainWheel() {
    wheelTimer = null;
    if (wheelBusy || active || disposed) return;
    wheelBusy = true;
    const token = ++gestureToken;
    try {
      while (Math.abs(wheelDelta) >= .1 && !disposed && !active && token === gestureToken) {
        const delta = Math.max(-180, Math.min(180, wheelDelta)); wheelDelta -= delta;
        const {start, end} = wheelPath(wheelPoint, delta, sensitivity, wheelSize, horizontal);
        await enqueue(() => gesture(start, end, 90, token));
      }
    } finally { wheelBusy = false; }
  }
  return {
    down(id, point) {
      if (active || disposed || !point) return false;
      // A click interrupts wheel/programmatic motion after lifting its finger.
      ++gestureToken; wheelDelta = 0; clearTimeout(wheelTimer); wheelTimer = null;
      const session = {id, start: point, last: point, pending: null, moveQueued: false, dragged: false, sentAt: 0, size: getSize()};
      active = session;
      enqueue(async () => { session.sentAt = performance.now(); await contact(point); });
      return true;
    },
    move(id, point) {
      if (!active || id !== active.id || !point) return;
      active.pending = point;
      if (scheduled == null) scheduled = requestAnimationFrame(() => flushMove());
    },
    release,
    wheel(point, deltaY, mode, viewHeight, speed = 1, deltaX = 0, viewWidth = 300) {
      if (active || disposed || !point || (!deltaY && !deltaX)) return;
      horizontal = Math.abs(deltaX) > Math.abs(deltaY);
      const delta = horizontal ? deltaX : deltaY;
      wheelPoint = point; sensitivity = speed; wheelSize = horizontal ? viewWidth : viewHeight;
      const pixels = delta * (mode === 1 ? 16 : mode === 2 ? wheelSize : 1);
      wheelDelta = Math.max(-360, Math.min(360, wheelDelta + pixels));
      if (!wheelTimer && !wheelBusy) wheelTimer = setTimeout(drainWheel, 12);
    },
    swipe(direction) {
      if (active || wheelBusy || disposed) return chain;
      wheelBusy = true;
      const token = ++gestureToken;
      const paths = {left: [{x: 56000, y: 32768}, {x: 9000, y: 32768}], right: [{x: 9000, y: 32768}, {x: 56000, y: 32768}], home: [{x: 32768, y: 64000}, {x: 32768, y: 25000}]};
      if (!paths[direction]) { wheelBusy = false; return chain; }
      enqueue(() => gesture(...paths[direction], 180, token));
      chain = chain.finally(() => { wheelBusy = false; });
      return chain;
    },
    enqueueAction: task => enqueue(task),
    idle: () => chain,
    dispose() { disposed = true; ++gestureToken; clearTimeout(wheelTimer); release(null); },
  };
}

export const keyUsages = (() => {
  const keys = {Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44, Minus: 45, Equal: 46, BracketLeft: 47, BracketRight: 48, Backslash: 49, Semicolon: 51, Quote: 52, Backquote: 53, Comma: 54, Period: 55, Slash: 56, CapsLock: 57, ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81, ArrowUp: 82, ControlLeft: 224, ShiftLeft: 225, AltLeft: 226, MetaLeft: 227, ControlRight: 228, ShiftRight: 229, AltRight: 230, MetaRight: 231};
  for (let i = 0; i < 26; i++) keys['Key' + String.fromCharCode(65 + i)] = 4 + i;
  for (let i = 1; i <= 9; i++) keys['Digit' + i] = 29 + i;
  keys.Digit0 = 39;
  return keys;
})();
