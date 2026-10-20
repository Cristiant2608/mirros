import {post} from './transport.js';
import {usePhoneInput} from './hooks/usePhoneInput.js';
import {bridge, native} from './bridge.js';
import {IconButton, Toggle, Logo, ResizeHandles} from './components/Controls.jsx';
import {useAudio} from './hooks/useAudio.js';
import {useConnection} from './hooks/useConnection.js';
import {usePhoneVideo} from './hooks/usePhoneVideo.js';
import {FrameRate} from './components/FrameRate.jsx';
import React, {useEffect, useRef, useState} from 'react';
import {Smartphone, Pin, Minus, X, Maximize2, Home, LockKeyhole, Volume2, VolumeX, Volume1, Camera, Mouse, ArrowLeft, ArrowRight, RefreshCw, Keyboard, Scan, Palette, Clipboard, ExternalLink, ChevronRight, Check, Cable, CircleHelp, GripHorizontal, Monitor, LoaderCircle, Download, Send, RotateCw, ChevronLeft, LogOut, Moon, Sun} from 'lucide-react';
import {rotateDevice} from './orientation.js';
import './style.css';


const platformLabel = navigator.userAgent.includes('Windows') ? 'Windows' : navigator.userAgent.includes('Linux') ? 'Linux' : 'tu sistema';
const sections = [[Smartphone, 'phone', 'Pantalla'], [Volume2, 'audio', 'Audio'], [Clipboard, 'clipboard', 'Portapapeles'], [Palette, 'appearance', 'Apariencia'], [CircleHelp, 'help', 'Ayuda']];
const themes = [['claro', 'Claro'], ['oscuro', 'Oscuro'], ['lavanda', 'Lavanda'], ['oceano', 'Océano']];
export default function App() {
  const [state, setState] = useConnection();
  const [tab, setTab] = useState('phone'), [notice, setNotice] = useState('');
  const [keyboard, setKeyboard] = useState(false), [text, setText] = useState('');
  const [sensitivity, setSensitivity] = useState(() => Number(localStorage.getItem('sensibilidad') || 1));
  const [pointer, setPointer] = useState(() => ({
    shape: localStorage.getItem('puntero-forma') || 'flecha',
    color: localStorage.getItem('puntero-color') || '#ffffff',
    size: Number(localStorage.getItem('puntero-tamano') || 100),
  }));
  const [pointerPosition, setPointerPosition] = useState(null);
  const [rotating, setRotating] = useState(false);
  async function rotatePhone() {
    if (!connected || rotating) return;
    setRotating(true);
    video.current?.rotateView();
    try {
      const result = await rotateDevice();
      if (result.currentDeviceOrientation === 'portrait') setNotice('Vista girada. iOS mantiene la aplicación en vertical.');
    }
    catch { setNotice('Vista girada. iOS no aceptó cambiar la orientación del teléfono.'); }
    finally { setRotating(false); }
  }
  const [clipboardBusy, setClipboardBusy] = useState(false);
  async function shareClipboard(direction) {
    setClipboardBusy(true);
    try { setNotice(await native('clipboard', direction)); }
    catch (error) { setNotice(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setClipboardBusy(false); }
  }
  const clipboardLock = useRef(false);
  async function runClipboardShortcut(action) {
    if (clipboardLock.current || !connected || !bridge) return;
    clipboardLock.current = true; setClipboardBusy(true);
    try { setNotice(await native('clipboardShortcut', action)); }
    catch (error) { setNotice(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { clipboardLock.current = false; setClipboardBusy(false); }
  }
  const canvas = useRef(null), stage = useRef(null), [phoneSize, setPhoneSize] = useState({width: 280, height: 610});
  const floating = state.mode === 'phone', connected = state.phase === 'conectado', controlsVisible = state.controlsVisible !== false;
  const {audioEnabled, audioStatus, volume, setVolume, toggleAudio} = useAudio(connected);
  const {dimensions, frames, live, videoStatus, rotation, video} = usePhoneVideo(canvas, connected, floating);
  function toggleControls() { if (bridge) native('controls', !controlsVisible); else setState(value => ({...value, controlsVisible: !controlsVisible})); }
  useEffect(() => { document.body.classList.toggle('floating', floating); }, [floating]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => { document.documentElement.dataset.theme = state.theme === 'sistema' ? (media.matches ? 'oscuro' : 'claro') : state.theme || 'claro'; };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [state.theme]);
  function setTheme(theme) { if (bridge) native('theme', theme); else setState(value => ({...value, theme})); }
  function updatePointer(key, value) {
    setPointer(previous => {
      const next = {...previous, [key]: value};
      localStorage.setItem(`puntero-${key === 'shape' ? 'forma' : key === 'color' ? 'color' : 'tamano'}`, String(value));
      return next;
    });
  }
  function trackPointer(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    // The shell has a 5 px frame around the canvas; keep the visual marker aligned
    // without changing the coordinates used by usePhoneInput.
    setPointerPosition({x: event.clientX - rect.left + 5, y: event.clientY - rect.top + 5});
  }

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const fit = () => {
      const {width, height} = node.getBoundingClientRect();
      const ratio = dimensions.width / dimensions.height;
      const availableHeight = Math.max(100, height - (floating ? 28 : 24));
      const availableWidth = Math.max(80, width - (controlsVisible ? (floating ? 78 : 74) : (floating ? 42 : 38)));
      const h = Math.min(availableHeight, availableWidth / ratio);
      const nextWidth = Math.round(h * ratio), nextHeight = Math.round(h);
      setPhoneSize(previous => previous.width === nextWidth && previous.height === nextHeight ? previous : {width: nextWidth, height: nextHeight});
    };
    const observer = new ResizeObserver(fit); observer.observe(node); fit(); return () => observer.disconnect();
  }, [dimensions, floating, tab, controlsVisible]);
  async function setDisplayMode(mode) {
    try {
      if (bridge) {
        await native('displayMode', mode);
      } else {
        await post('/display-mode', {mode});
        setState(v => ({...v, displayMode: mode}));
      }
      setNotice(connected ? (mode === 'aod' ? 'Reposo solicitado. La captura puede detenerse al bloquear el iPhone.' : 'Modo Pantalla Dual solicitado.') : 'Preferencia guardada para la próxima conexión.');
    } catch (err) {
      setNotice(err.message);
    }
  }
  async function wakePhone() {
    if (!connected) return;
    try {
      if (bridge) await native('wake');
      else await post('/wake', {});
      setNotice('Despertando iPhone…');
    } catch (err) {
      setNotice(err.message);
    }
  }
  const input = usePhoneInput({canvas, connected, sensitivity, rotation, floating, onError: setNotice, button, capture, setKeyboard, clipboardShortcut: runClipboardShortcut, wake: wakePhone});
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timeout); }, [notice]);
  function button(name) { if (connected) post('/button', {name, state: 'press'}).catch(error => setNotice(error.message)); }
  async function phoneAudioButton(name) {
    if (!connected) return;
    try { await post('/button', {name, state: 'press'}); setNotice(name === 'mute' ? 'Botón Silencio enviado al iPhone. Comprueba el resultado en iOS.' : 'Volumen del iPhone ajustado.'); }
    catch (error) { setNotice(error.message); }
  }
  async function capture() {
    if (!live || !canvas.current) return;
    try {
      const image = await new Promise((resolve, reject) => canvas.current.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear la captura.')), 'image/png'));
      if (bridge) {
        if (await native('saveCapture', new Uint8Array(await image.arrayBuffer()))) setNotice('Captura guardada.');
      } else {
        const url = URL.createObjectURL(image), link = document.createElement('a');
        link.download = 'Mirros.png'; link.href = url; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) { setNotice(error.message); }
  }
  async function sendText(event) {
    event.preventDefault(); if (!text.trim()) return;
    try { await post('/clipboard', {text}); await post('/key', {usages: [227, 25]}); await post('/key', {usages: []}); setText(''); setNotice('Texto enviado al iPhone.'); } catch (error) { setNotice(error.message); }
  }
  const preview = <div className={`preview-stage ${floating ? 'is-floating' : ''}`} ref={stage}>
    <div className={`phone-shell ${live ? 'is-live' : ''}`} style={{width: phoneSize.width + 12, height: phoneSize.height + 12, '--phone-radius': `${Math.round(Math.min(phoneSize.width, phoneSize.height) * .125)}px`}}>
      <canvas ref={canvas} tabIndex={0} onPointerMove={trackPointer} onPointerLeave={() => setPointerPosition(null)} aria-label="Pantalla del iPhone. Clic para tocar, arrastra para deslizar y usa la rueda para desplazarte." style={{width: phoneSize.width, height: phoneSize.height}}/>
      {pointerPosition && <span className={`phone-pointer pointer-${pointer.shape}`} aria-hidden="true" style={{left: pointerPosition.x, top: pointerPosition.y, '--pointer-color': pointer.color, '--pointer-scale': pointer.size / 100}}/>}
      {!live && <div className="phone-placeholder"><div className="placeholder-symbol">{connected || state.phase === 'preparando' ? <LoaderCircle size={26} className="spin"/> : <Cable size={28}/>}</div><strong>{state.phase === 'pausado' ? 'Sesión terminada' : state.phase === 'error' ? 'Conexión interrumpida' : state.phase === 'preparando' ? 'Preparando iPhone' : connected ? 'Cargando pantalla' : 'iPhone desconectado'}</strong><span>{state.phase === 'pausado' ? 'Puedes retirar el cable o volver a conectar.' : connected ? videoStatus : state.phase === 'preparando' ? 'Mantén el cable conectado.' : 'Conecta el cable USB y desbloquea el teléfono.'}</span>{['error','pausado'].includes(state.phase) && <button className="small-button" onClick={() => native('retry')}>Reintentar</button>}<span className="placeholder-line"/></div>}
    </div>
    <div className={`controls-panel ${controlsVisible ? 'expanded' : 'collapsed'}`} style={{height: phoneSize.height + 12}}>
      <button className="controls-tab" aria-label={controlsVisible ? 'Guardar controles' : 'Desplegar controles'} aria-expanded={controlsVisible} title={controlsVisible ? 'Guardar controles' : 'Desplegar controles'} onClick={toggleControls}>{controlsVisible ? <ChevronLeft size={13}/> : <ChevronRight size={13}/>}</button>
      <div className="controls-drawer" inert={!controlsVisible} aria-hidden={!controlsVisible}>
        <div className="phone-controls" role="toolbar" aria-label="Controles del iPhone" aria-orientation="vertical">
          <IconButton icon={X} label="Salir de Mirros" onClick={() => native('close')} disabled={!bridge}/>
          <IconButton icon={ArrowLeft} label="Deslizar a la izquierda" disabled={!connected} onClick={() => input.current?.swipe('left')}/>
          <IconButton icon={ArrowRight} label="Deslizar a la derecha" disabled={!connected} onClick={() => input.current?.swipe('right')}/>
          <IconButton icon={Home} label="Inicio · Ctrl+H" disabled={!connected} onClick={() => button('home')}/>
          <span className="control-separator"/>
          <IconButton icon={RotateCw} label="Girar vista 90°" disabled={!connected || rotating} onClick={rotatePhone}/>
          <IconButton icon={Maximize2} label="Usar todo el alto disponible" disabled={!bridge} onClick={() => native('fitHeight')}/>
          <IconButton icon={floating ? Monitor : ExternalLink} label={floating ? 'Abrir panel' : 'Ventana flotante'} disabled={!bridge} onClick={() => native('mode', floating ? 'studio' : 'phone')}/>
          <IconButton icon={Pin} label="Siempre encima" active={state.alwaysOnTop} disabled={!bridge} onClick={() => native('pin', !state.alwaysOnTop)}/>
          <span className="control-separator"/>
          <IconButton icon={audioEnabled ? Volume2 : VolumeX} label={audioEnabled ? 'Desactivar audio del PC' : 'Activar audio del PC'} active={audioEnabled} onClick={toggleAudio}/>
          <IconButton icon={VolumeX} label="Alternar silencio del iPhone" disabled={!connected} onClick={() => phoneAudioButton('mute')}/>
          <IconButton icon={Camera} label="Guardar captura · Ctrl+P" disabled={!live} onClick={capture}/>
          <span className="control-separator"/>
          <IconButton icon={state.displayMode === 'aod' ? Sun : Moon} label={state.displayMode === 'aod' ? 'Modo actual: reposo experimental (clic para Pantalla Dual)' : 'Solicitar reposo experimental'} active={state.displayMode === 'aod'} disabled={!connected} onClick={() => setDisplayMode(state.displayMode === 'aod' ? 'dual' : 'aod')}/>
          <IconButton icon={Sun} label="Solicitar despertar iPhone · Ctrl+U" disabled={!connected} onClick={wakePhone}/>
          <IconButton icon={LockKeyhole} label="Bloquear iPhone · Ctrl+L" disabled={!connected} onClick={() => button('lock')}/>
          <IconButton icon={LogOut} label="Desconectar de forma segura" disabled={!connected} onClick={() => native('disconnect')}/>
          <IconButton icon={Minus} label="Minimizar" onClick={() => native('minimize')} disabled={!bridge}/>
          {floating && <span className="control-drag" title="Mover ventana"><GripHorizontal size={16}/></span>}
        </div>
      </div>
    </div>
  </div>;
  const statusLabel = connected ? 'Conectado' : state.phase === 'preparando' ? 'Preparando' : state.phase === 'pausado' ? 'Sesión terminada' : state.phase === 'error' ? 'Error de conexión' : 'Sin conexión';
  const currentSection = sections.find(([, id]) => id === tab);
  const SectionIcon = currentSection[0];
  if (floating) return <div className="floating-app" data-audio-status={audioStatus}>{preview}<ResizeHandles/>{notice && <div className="floating-notice" role="status">{notice}</div>}</div>;
  return <div className="studio">
    <aside className="sidebar">
      <div className="sidebar-brand"><Logo/></div>
      <div className="sidebar-label">DISPOSITIVO</div>
      <div className={`sidebar-device ${connected ? 'connected' : ''}`}><div className="device-avatar"><Smartphone size={20}/></div><div><strong>{state.device?.name || 'iPhone'}</strong><small><i/>{statusLabel}</small></div></div>
      <div className="sidebar-label">CONTROLES</div>
      <nav aria-label="Secciones">{sections.map(([Icon, id, label]) => <button key={id} className={tab === id ? 'selected' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={17}/><span>{label}</span>{tab === id && <span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="floating-launch" onClick={() => native('mode', 'phone')} disabled={!bridge}><ExternalLink size={16}/><span>Ventana flotante</span></button><div className="sidebar-app-info"><span>Mirros</span><span>{state.version?.split('.').slice(0,2).join('.') || '—'} · USB</span></div></div>
    </aside>
    <div className="workspace">
      <header className="toolbar"><div className="toolbar-title"><strong>{state.device?.name || 'iPhone'}</strong><ChevronRight size={14}/><span>{currentSection[2]}</span></div><div className="window-actions"><IconButton icon={Minus} label="Minimizar" onClick={() => native('minimize')}/><IconButton icon={Maximize2} label="Maximizar o restaurar" onClick={() => native('maximize')}/><IconButton icon={X} label="Cerrar Mirros" className="close-button" onClick={() => native('close')}/></div></header>
      <div className="workspace-content">
        <section className="viewer" aria-label="Vista del iPhone"><div className="viewer-heading"><span className={`connection-pill ${connected ? 'connected' : ''}`}><i/>{connected ? 'USB conectado' : statusLabel}</span><span className="stream-info">{live ? <><FrameRate frames={frames}/> · {dimensions.width} × {dimensions.height}</> : 'Vista en directo'}</span></div>{preview}<div className="viewer-hints"><span><Mouse size={13}/>Clic y arrastrar</span><span><Scan size={13}/>Rueda para desplazar</span><span><Keyboard size={13}/>{keyboard ? 'Teclado activo' : 'Clic para escribir'}</span></div></section>
        <aside className="inspector" aria-label={currentSection[2]}><div className="inspector-heading"><span className="section-symbol"><SectionIcon size={20}/></span><div><h1>{currentSection[2]}</h1><p>{{phone: 'Dispositivo y ventana', audio: 'Salidas y volumen', clipboard: 'Copiar y enviar contenido', appearance: 'Tema, tamaño y gestos', help: 'Conexión y atajos'}[tab]}</p></div></div>
          <div className="inspector-content" key={tab}>
          {tab === 'phone' && <>
            <section className="settings-group"><h2>Dispositivo</h2><div className="settings-box"><div className="info-row"><span>Nombre</span><strong>{state.device?.name || 'iPhone'}</strong></div><div className="info-row"><span>Conexión</span><strong>{connected ? 'USB' : 'No conectado'}</strong></div>{state.device?.version && <div className="info-row"><span>Versión</span><strong>iOS {state.device.version}</strong></div>}<button className="row-button" onClick={() => native('retry')}><RefreshCw size={15}/>Reconectar<ChevronRight size={14}/></button></div></section>
            <section className="settings-group"><h2>Modo de pantalla física</h2>
              <div className="settings-box">
                <div className="stacked-row">
                  <span>Modo</span>
                  <div className="segmented" role="group" aria-label="Modo de pantalla física">
                    <button className={state.displayMode !== 'aod' ? 'selected' : ''} aria-pressed={state.displayMode !== 'aod'} onClick={() => setDisplayMode('dual')}>Pantalla Dual</button>
                    <button className={state.displayMode === 'aod' ? 'selected' : ''} aria-pressed={state.displayMode === 'aod'} onClick={() => setDisplayMode('aod')}>Reposo experimental</button>
                  </div>
                </div>
                <button className="row-button" disabled={!connected} onClick={() => button('lock')}>
                  <Moon size={15}/>Solicitar reposo del iPhone<ChevronRight size={14}/>
                </button>
                <button className="row-button" disabled={!connected} onClick={wakePhone}>
                  <Sun size={15}/>Despertar pantalla del iPhone<ChevronRight size={14}/>
                </button>
              </div>
              <p className="group-description">
                {state.displayMode === 'aod'
                  ? 'Solicita bloquear el iPhone y deja de renovar la prevención de reposo. La captura puede detenerse; todavía requiere validación física.'
                  : 'Pantalla Dual: mantiene la pantalla del iPhone encendida simultáneamente con la ventana en tu PC.'}
              </p>
            </section>
            <section className="settings-group"><h2>Ventana</h2><div className="settings-box"><Toggle label="Siempre encima" detail="Mantener visible sobre otras ventanas" value={state.alwaysOnTop} onClick={() => native('pin', !state.alwaysOnTop)} disabled={!bridge}/><button className="row-button" onClick={() => native('mode', 'phone')} disabled={!bridge}><ExternalLink size={15}/>Abrir teléfono flotante<ChevronRight size={14}/></button></div></section>
            <section className="settings-group"><h2>Sesión</h2><div className="settings-box"><button className="row-button" disabled={!connected} onClick={() => native('disconnect')}><LogOut size={16}/>Desconectar de forma segura<ChevronRight size={14}/></button></div><p className="group-description">Libera teclado y toques antes de retirar el cable. Cerrar Mirros también termina la sesión.</p></section>
            <section className="settings-group"><h2>Orientación</h2><div className="settings-box"><button className="row-button" disabled={!connected || rotating} onClick={rotatePhone}><RotateCw size={16}/>Girar vista 90°<ChevronRight size={14}/></button></div><p className="group-description">La vista sigue la orientación de iOS. El botón también gira la imagen si la aplicación permanece vertical.</p></section>
            <section className="settings-group"><h2>Acciones</h2><div className="action-grid">{[[Home,'Inicio','home'],[LockKeyhole,'Bloquear','lock'],[Camera,'Captura','capture']].map(([Icon,label,command]) => <button key={command} disabled={command === 'capture' ? !live : !connected} onClick={() => command === 'capture' ? capture() : button(command)}><Icon size={20}/><span>{label}</span></button>)}</div><p className="group-description">Mantén el iPhone despierto para una captura continua. Despertar no sustituye Face ID ni el código de iOS.</p></section>
            <div className="note"><Mouse size={16}/><p>Haz clic para tocar y arrastra para deslizar. El clic derecho vuelve a Inicio.</p></div>
          </>}
          {tab === 'audio' && <>
            <section className="settings-group"><h2>Este PC</h2><div className="settings-box"><Toggle label="Reproducir audio en el PC" detail={audioStatus} value={audioEnabled} onClick={toggleAudio}/><label className="slider-row"><span>Volumen <output>{Math.round(volume * 100)} %</output></span><div><Volume1 size={15}/><input aria-label="Volumen del PC" type="range" min="0" max="1" step="0.05" value={volume} disabled={!audioEnabled} onChange={event => setVolume(Number(event.target.value))}/><Volume2 size={16}/></div></label></div><p className="group-description">Usa la salida de sonido predeterminada de {platformLabel}.</p></section>
            <section className="settings-group"><h2>iPhone</h2><div className="settings-box"><div className="volume-buttons"><button disabled={!connected} aria-label="Bajar volumen del iPhone" onClick={() => phoneAudioButton('volume-down')}><Volume1 size={18}/>Bajar</button><button disabled={!connected} aria-label="Subir volumen del iPhone" onClick={() => phoneAudioButton('volume-up')}><Volume2 size={18}/>Subir</button></div><button className="row-button" disabled={!connected} onClick={() => phoneAudioButton('mute')}><VolumeX size={16}/>Alternar silencio<ChevronRight size={14}/></button></div><p className="group-description">El estado se muestra en iOS. Silencio puede no afectar a música o videos.</p></section>
            <div className="note"><Volume2 size={17}/><p>Para escuchar solo en el iPhone, desactiva el audio del PC.</p></div>
          </>}
          {tab === 'clipboard' && <>
            <section className="settings-group"><h2>Copiar y pegar</h2><div className="settings-box"><div className="info-row"><span>Copiar la selección del iPhone al PC</span><kbd>Ctrl + C</kbd></div><div className="info-row"><span>Pegar del PC en el iPhone</span><kbd>Ctrl + V</kbd></div></div><p className="group-description">Haz clic en la pantalla del iPhone para usar los atajos. En las aplicaciones del PC, copia y pega normalmente. Texto e imágenes compatibles.</p>{clipboardBusy && <p className="group-description" role="status">Preparando el portapapeles… iOS puede tardar con contenido de algunas aplicaciones.</p>}</section>
            <details className="settings-group"><summary>Transferencia manual y envío de texto</summary>
            <section className="settings-group"><h2>Compartir portapapeles</h2><div className="transfer-stack"><button disabled={!bridge || !connected || clipboardBusy} onClick={() => shareClipboard('toPhone')}><span className="transfer-icon"><Send size={20}/></span><span><strong>PC → iPhone</strong><small>Enviar lo que copiaste en el PC</small></span><ChevronRight size={16}/></button><button disabled={!bridge || !connected || clipboardBusy} onClick={() => shareClipboard('toPC')}><span className="transfer-icon"><Download size={20}/></span><span><strong>iPhone → PC</strong><small>Traer lo que copiaste en el iPhone</small></span><ChevronRight size={16}/></button></div><p className="group-description">{clipboardBusy ? 'Transfiriendo… iOS puede tardar hasta un minuto y medio con contenido de algunas aplicaciones.' : 'Texto e imágenes. Después, pega en la aplicación de destino.'}</p></section>
            <section className="settings-group"><h2>Enviar texto</h2><form className="text-form" onSubmit={sendText}><textarea value={text} onChange={event => setText(event.target.value)} placeholder="Escribe o pega aquí…" aria-label="Texto para enviar al iPhone"/><button className="primary-button" disabled={!connected || !text.trim()}><Send size={15}/>Pegar en el iPhone</button></form><p className="group-description">Selecciona primero un campo de texto en el teléfono.</p></section>
            </details>
            <div className="note"><Clipboard size={16}/><p>El portapapeles se comparte al copiar o pegar sobre el iPhone. No se lee en segundo plano.</p></div>
          </>}
          {tab === 'appearance' && <>
            <section className="settings-group"><h2>Tema</h2><div className="theme-grid" role="group" aria-label="Tema de la interfaz">{themes.map(([id,label]) => <button key={id} aria-pressed={state.theme === id} onClick={() => setTheme(id)} className={state.theme === id ? 'chosen' : ''}><span className={`theme-preview theme-${id}`}><i/><b/><em/>{state.theme === id && <span><Check size={12}/></span>}</span><strong>{label}</strong></button>)}</div><div className="settings-box"><Toggle label="Usar tema del sistema" value={state.theme === 'sistema'} onClick={() => setTheme(state.theme === 'sistema' ? 'claro' : 'sistema')}/></div></section>
            <section className="settings-group"><h2>Teléfono flotante</h2><div className="settings-box"><div className="stacked-row"><span>Tamaño</span><div className="segmented" role="group" aria-label="Tamaño del teléfono">{['pequeño','mediano','grande'].map(size => <button key={size} aria-pressed={state.size === size} className={state.size === size ? 'selected' : ''} onClick={() => native('size', size)}>{size}</button>)}</div></div><Toggle label="Siempre encima" value={state.alwaysOnTop} onClick={() => native('pin', !state.alwaysOnTop)} disabled={!bridge}/></div></section>
            <section className="settings-group"><h2>Ratón</h2><div className="settings-box"><label className="slider-row"><span>Sensibilidad de la rueda <output>{sensitivity.toFixed(1)}×</output></span><div><Mouse size={15}/><input aria-label="Sensibilidad de la rueda" type="range" min="0.5" max="2" step="0.1" value={sensitivity} onChange={event => {const value = Number(event.target.value); setSensitivity(value); localStorage.setItem('sensibilidad',value);}}/></div></label><div className="stacked-row"><span>Puntero dentro del iPhone</span><div className="segmented" role="group" aria-label="Forma del puntero">{[['flecha','Flecha'],['círculo','Círculo'],['punto','Punto']].map(([id,label]) => <button key={id} aria-pressed={pointer.shape === id} className={pointer.shape === id ? 'selected' : ''} onClick={() => updatePointer('shape', id)}>{label}</button>)}</div></div><label className="slider-row"><span>Tamaño <output>{pointer.size} %</output></span><div><span className="pointer-swatch" style={{background: pointer.color}}/><input aria-label="Tamaño del puntero" type="range" min="50" max="200" step="10" value={pointer.size} onChange={event => updatePointer('size', Number(event.target.value))}/></div></label><label className="color-row"><span>Color</span><input aria-label="Color del puntero" type="color" value={pointer.color} onChange={event => updatePointer('color', event.target.value)}/></label></div><p className="group-description">El puntero solo cambia la apariencia. La posición enviada al iPhone mantiene la misma precisión.</p></section>
          </>}
          {tab === 'help' && <>
            <section className="settings-group"><h2>Actualizaciones</h2><div className="settings-box"><div className="info-row"><span>Versión instalada</span><strong>{state.version || '—'}</strong></div><button className="row-button" disabled={['comprobando','descargando'].includes(state.update?.phase)} onClick={() => native('updatesCheck')}><RefreshCw size={15}/>Buscar actualizaciones<ChevronRight size={14}/></button>{state.update?.phase === 'disponible' && <button className="row-button" onClick={() => native('updatesDownload')}><Download size={15}/>Descargar {state.update.version}<ChevronRight size={14}/></button>}{state.update?.phase === 'lista' && <button className="row-button" onClick={() => native('updatesInstall')}><RefreshCw size={15}/>Reiniciar y actualizar<ChevronRight size={14}/></button>}</div><p className="group-description">{state.update?.message || 'Consulta automáticamente las versiones publicadas en GitHub.'}{state.update?.phase === 'descargando' ? ` ${state.update.progress || 0} %` : ''}</p></section>
            <section className="settings-group"><h2>Conectar el iPhone</h2><ol className="steps"><li><span>1</span><p>Conecta un cable USB de datos.</p></li><li><span>2</span><p>Desbloquea el iPhone y acepta «Confiar».</p></li><li><span>3</span><p>Activa Modo Desarrollador en Ajustes → Privacidad y seguridad.</p></li></ol></section>
            <section className="settings-group"><h2>Controles</h2><div className="settings-box">{[['Tocar','Clic'],['Deslizar','Clic y arrastrar'],['Desplazar','Rueda del ratón'],['Inicio','Clic derecho']].map(([a,b]) => <div className="info-row" key={a}><span>{a}</span><strong>{b}</strong></div>)}</div></section>
            <section className="settings-group"><h2>Atajos sobre la pantalla</h2><div className="settings-box">{[['Inicio','Ctrl + H'],['Bloquear / Reposo','Ctrl + L'],['Solicitar despertar','Ctrl + U'],['Guardar captura','Ctrl + P']].map(([a,b]) => <div className="info-row" key={a}><span>{a}</span><kbd>{b}</kbd></div>)}</div></section><button className="secondary-button" onClick={() => native('logs')}>Abrir registro de conexión</button>
          </>}
          </div>
        </aside>
      </div>
      <footer className="statusbar"><span className={state.phase === 'error' ? 'error-text' : ''}><i className={connected ? 'connected' : ''}/>{connected ? `${state.device?.name || 'iPhone'} conectado por USB` : state.message}</span><span>{audioEnabled ? <Volume2 size={12}/> : <VolumeX size={12}/>}Audio PC {audioEnabled ? 'activado' : 'desactivado'}</span></footer>
    </div>
    {state.phase === 'seleccion' && <div className="modal-backdrop"><section className="device-picker"><h2>Seleccionar iPhone</h2>{state.devices.map(device => <button key={device.udid} onClick={() => native('device', device.udid)}><Smartphone size={18}/>{device.name}<ChevronRight size={15}/></button>)}</section></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}
