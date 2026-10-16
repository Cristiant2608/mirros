const degrees = {portrait: 0, portraitUpsideDown: 180, landscapeLeft: -90, landscapeRight: 90};
export function frameRotation(orientation, width, height) {
  const angle = degrees[orientation] ?? 0;
  // Some iOS versions send a portrait buffer, others already rotate its pixels.
  return width > height && Math.abs(angle) === 90 ? 0 : angle;
}
export function devicePoint(point, rotation = 0) {
  if (!point) return point;
  const {x, y} = point;
  switch ((rotation + 360) % 360) {
    case 90: return {x: y, y: 65535 - x};
    case 180: return {x: 65535 - x, y: 65535 - y};
    case 270: return {x: 65535 - y, y: x};
    default: return {x, y};
  }
}
export async function rotateDevice(direction = 'right', signal) {
  const response = await fetch('/rotate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({direction}), signal: signal || AbortSignal.timeout(6000)});
  if (!response.ok) throw new Error('No se pudo girar el iPhone. Revisa la conexión.');
  return response.json();
}
export function followOrientation(onOrientation) {
  const abort = new AbortController();
  let timer, previous;
  async function poll() {
    try {
      const response = await fetch('/orientation', {signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4500)]), cache: 'no-store'});
      if (response.ok) {
        const value = await response.json();
        if (!abort.signal.aborted && value.orientation in degrees && value.orientation !== previous) {
          previous = value.orientation; onOrientation(value.orientation);
        }
      }
    } catch { /* Older iOS services can lack orientation queries; video still works. */ }
    if (!abort.signal.aborted) timer = setTimeout(poll, 800);
  }
  poll();
  return () => { abort.abort(); clearTimeout(timer); };
}
