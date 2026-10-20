export const clamp = (value, min = 0, max = 65535) => Math.max(min, Math.min(max, Math.round(value)));
export function coordinates(clientX, clientY, rect) {
  if (!(rect.width > 0 && rect.height > 0)) return null;
  return {x: clamp((clientX - rect.left) / rect.width * 65535), y: clamp((clientY - rect.top) / rect.height * 65535)};
}
// iOS requires system gestures to begin at the physical edge. The rounded
// preview makes that single pixel difficult to hit with a mouse.
export function edgeStart(point, size, margin = 8) {
  if (!point) return point;
  const snap = (value, pixels) => value / 65535 * pixels <= margin ? 0 : (65535 - value) / 65535 * pixels <= margin ? 65535 : value;
  return {x: snap(point.x, size.width), y: snap(point.y, size.height)};
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
    session.samples.push({point: session.pending, at: session.pendingAt});
    session.pending = null;
    // Keep a bounded path, including its first movement and final position.
    // Dropping every intermediate sample turns edge swipes into teleports.
    if (session.samples.length > 24) session.samples.splice(1, 1);
    if (session.moveQueued) return;
    session.moveQueued = true;
    enqueue(async () => {
      try {
        while (session.samples.length && !disposed && !session.cancelled) {
          const {point, at} = session.samples.shift();
          await sleep(Math.max(0, at - session.startedAt - (performance.now() - session.sentAt)));
          if (point.x !== session.last.x || point.y !== session.last.y) {
            session.last = point;
            await contact(point);
          }
        }
      } finally {
        session.moveQueued = false;
      }
    });
  }
  function release(id, point) {
    const session = active;
    if (!session || (id != null && id !== session.id)) return chain;
    if (scheduled != null) { cancelAnimationFrame(scheduled); scheduled = null; }
    const releasedAt = performance.now();
    if (id == null) { session.cancelled = true; session.pending = null; session.samples.length = 0; }
    if (point) { session.pending = point; session.pendingAt = releasedAt; }
    flushMove(session);
    active = null;
    enqueue(async () => {
      // Preserve the user's hold even when opening HID delayed the down ACK.
      const minimum = disposed || session.cancelled ? 0 : Math.max(session.dragged ? 16 : 40, releasedAt - session.startedAt);
      await sleep(Math.max(0, minimum - (performance.now() - session.sentAt)));
      await lift(session.dragged ? session.last : session.start);
    });
    return chain;
  }
  async function gesture(start, end, duration, token, hold = 0) {
    let final = start;
    try {
      await contact(start);
      const began = performance.now();
      while (!disposed && token === gestureToken) {
        const elapsed = performance.now() - began;
        if (elapsed < duration) await sleep(Math.min(12, duration - elapsed));
        if (disposed || token !== gestureToken) break;
        const progress = Math.min(1, (performance.now() - began) / duration);
        final = {x: clamp(start.x + (end.x - start.x) * progress), y: clamp(start.y + (end.y - start.y) * progress)};
        await contact(final);
        if (progress === 1) break;
      }
      if (!disposed && token === gestureToken && hold > 0) {
        await sleep(hold);
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
      const session = {id, start: point, last: point, pending: null, samples: [], pendingAt: 0, moveQueued: false, dragged: false, sentAt: 0, startedAt: performance.now(), size: getSize()};
      active = session;
      enqueue(async () => { await contact(point); session.sentAt = performance.now(); });
      return true;
    },
    move(id, point) {
      if (!active || id !== active.id || !point) return;
      active.pending = point;
      active.pendingAt = performance.now();
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
      const paths = {
        left: [{x: 56000, y: 32768}, {x: 9000, y: 32768}],
        right: [{x: 9000, y: 32768}, {x: 56000, y: 32768}],
        home: [{x: 32768, y: 64000}, {x: 32768, y: 25000}],
        switcher: [{x: 32768, y: 64500}, {x: 32768, y: 38000}],
      };
      if (!paths[direction]) { wheelBusy = false; return chain; }
      const hold = direction === 'switcher' ? 350 : 0;
      const duration = direction === 'switcher' ? 220 : 180;
      enqueue(() => gesture(paths[direction][0], paths[direction][1], duration, token, hold));
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
