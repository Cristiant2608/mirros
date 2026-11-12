import React, {useEffect, useRef} from 'react';
import {native} from '../bridge.js';
import {Video, Square} from 'lucide-react';
import {formatDuration} from '../recorder.mjs';
import {STRINGS} from '../i18n.js';

export function IconButton({icon: Icon, label, onClick, active, className = '', disabled = false}) {
  return <button className={`icon-button ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={17}/></button>;
}
export function RecordButton({recording, onClick, disabled = false, className = '', t = STRINGS.en}) {
  return (
    <IconButton
      icon={recording ? Square : Video}
      label={recording ? t.controls.recordStop : t.controls.recordStart}
      active={recording}
      className={`record-button ${recording ? 'recording-active' : ''} ${className}`}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
export function RecordingBadge({duration = 0, onStop, className = '', t = STRINGS.en}) {
  return (
    <div className={`recording-badge ${className}`} title={t.controls.recordBadgeTitle}>
      <span className="recording-pulse" aria-hidden="true" />
      <span>REC {formatDuration(duration)}</span>
      {onStop && (
        <button
          type="button"
          className="recording-stop-btn"
          onClick={onStop}
          title={t.controls.recordStop}
          aria-label={t.controls.recordStop}
        >
          <Square size={10} fill="currentColor" />
          <span>{t.controls.stopBtn}</span>
        </button>
      )}
    </div>
  );
}
export function Toggle({label, detail, value, onClick, disabled}) {
  return <button className="setting-row" role="switch" aria-checked={value} aria-label={label} onClick={onClick} disabled={disabled}><span><strong>{label}</strong>{detail && <small>{detail}</small>}</span><span className={`toggle ${value ? 'on' : ''}`}><i/></span></button>;
}
export function Logo() { return <div className="brand"><span className="logo-mark"><span/><span/></span><span>Mirros</span></div>; }
export function ResizeHandles({t = STRINGS.en}) {
  const drag = useRef(null), pending = useRef(null), raf = useRef(null);
  const finish = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (pending.current) native('resizeMove', pending.current);
    pending.current = null;
    if (drag.current !== null) native('resizeEnd');
    drag.current = null;
  };
  useEffect(() => {
    window.addEventListener('blur', finish);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('blur', finish);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      finish();
    };
  }, []);
  const start = (event, edge) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId);
    native('resizeStart', {edge, x: event.screenX, y: event.screenY});
  };
  const move = event => {
    if (drag.current !== event.pointerId) return;
    pending.current = {x: event.screenX, y: event.screenY};
    if (raf.current == null) raf.current = requestAnimationFrame(() => { raf.current = null; if (pending.current) native('resizeMove', pending.current); pending.current = null; });
  };
  return <div className="resize-handles" aria-hidden="true">{['n','s','e','w','ne','nw','se','sw'].map(edge => <div key={edge} className={`resize-handle resize-${edge}`} title={t.controls.resizeHandle} onPointerDown={event => start(event, edge)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}/>)}</div>;
}
