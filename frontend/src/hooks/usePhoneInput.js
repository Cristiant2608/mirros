import {useEffect, useRef} from 'react';
import {createInput, coordinates, edgeStart, keyUsages} from '../input.js';
import {devicePoint} from '../orientation.js';
import {post} from '../transport.js';

export function usePhoneInput({canvas, connected, sensitivity, rotation, floating, onError, button, capture, setKeyboard, clipboardShortcut, wake, appSwitcher}) {
  const input = useRef(null), callbacks = useRef(null);
  callbacks.current = {onError, button, capture, setKeyboard, clipboardShortcut, wake, appSwitcher};
  useEffect(() => {
    if (!canvas.current || !connected) return;
    const node = canvas.current;
    const send = (path, data) => post(path, path === '/touch' ? {...data, ...devicePoint(data, rotation)} : data);
    const controls = createInput(send, error => callbacks.current.onError(error.message), {getSize: () => node.getBoundingClientRect()}); input.current = controls;
    const point = event => coordinates(event.clientX, event.clientY, node.getBoundingClientRect());
    let startOffset = {x: 0, y: 0};
    const gesturePoint = event => { const p = point(event); return p && {x: Math.max(0, Math.min(65535, p.x + startOffset.x)), y: Math.max(0, Math.min(65535, p.y + startOffset.y))}; };
    const down = event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault(); node.focus({preventScroll: true});
      const raw = point(event), start = edgeStart(raw, node.getBoundingClientRect());
      if (controls.down(event.pointerId, start)) {
        startOffset = {x: start.x - raw.x, y: start.y - raw.y};
        node.setPointerCapture(event.pointerId);
      }
    };
    const move = event => controls.move(event.pointerId, gesturePoint(event.getCoalescedEvents?.().at(-1) || event));
    const up = event => controls.release(event.pointerId, gesturePoint(event));
    const release = () => controls.release(null);
    const wheel = event => { event.preventDefault(); controls.wheel(point(event), event.deltaY, event.deltaMode, node.clientHeight, sensitivity, event.deltaX, node.clientWidth); };
    const context = event => { event.preventDefault(); callbacks.current.button('home'); };
    const held = new Set(); let clipboardInFlight = false;
    const sendKeys = () => { const snapshot = [...held]; controls.enqueueAction(() => post('/key', {usages: snapshot})); };
    // Refresh the backend lease while modifiers or keys are deliberately held.
    const heartbeat = setInterval(() => { if (held.size) sendKeys(); }, 1500);
    const keys = event => {
      if (document.activeElement !== node) return;
      if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && ['c','v'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.repeat || clipboardInFlight) return;
        clipboardInFlight = true;
        const action = event.key.toLowerCase() === 'c' ? 'copy' : 'paste';
        held.clear();
        controls.enqueueAction(async () => { await post('/key', {usages:[]}); await callbacks.current.clipboardShortcut(action); })
          .finally(() => {clipboardInFlight = false;});
        return;
      }
      const shortcuts = {h: 'home', l: 'lock', '[': 'volume-down', ']': 'volume-up', s: 'siri'};
      if (event.type === 'keydown' && event.ctrlKey && shortcuts[event.key.toLowerCase()]) { event.preventDefault(); callbacks.current.button(shortcuts[event.key.toLowerCase()]); return; }
      if (event.type === 'keydown' && event.ctrlKey && (event.key.toLowerCase() === 'm' || event.key === 'Tab')) { event.preventDefault(); callbacks.current.appSwitcher?.(); return; }
      if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'u') { event.preventDefault(); callbacks.current.wake?.(); return; }
      if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'p') { event.preventDefault(); callbacks.current.capture(); return; }
      const usage = keyUsages[event.code]; if (!usage) return;
      event.preventDefault(); if (event.repeat) return;
      event.type === 'keydown' ? held.add(usage) : held.delete(usage); sendKeys();
    };
    const blur = () => { release(); if (held.size) { held.clear(); sendKeys(); } controls.enqueueAction(() => post('/key', {usages: [], detach: true})); callbacks.current.setKeyboard(false); };
    const focus = () => callbacks.current.setKeyboard(true);
    node.addEventListener('pointerdown', down); node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', release); node.addEventListener('lostpointercapture', release);
    node.addEventListener('wheel', wheel, {passive: false}); node.addEventListener('contextmenu', context); node.addEventListener('focus', focus); node.addEventListener('blur', blur);
    window.addEventListener('pointerup', up); window.addEventListener('blur', blur); window.addEventListener('keydown', keys); window.addEventListener('keyup', keys);
    return () => { clearInterval(heartbeat); blur(); controls.dispose(); input.current = null; node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', release); node.removeEventListener('lostpointercapture', release); node.removeEventListener('wheel', wheel); node.removeEventListener('contextmenu', context); node.removeEventListener('focus', focus); node.removeEventListener('blur', blur); window.removeEventListener('pointerup', up); window.removeEventListener('blur', blur); window.removeEventListener('keydown', keys); window.removeEventListener('keyup', keys); };
  }, [connected, sensitivity, rotation]);
  return input;
}
