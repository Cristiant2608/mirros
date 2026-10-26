import {post} from './transport.js';
import {usePhoneInput} from './hooks/usePhoneInput.js';
import {bridge, native} from './bridge.js';
import {IconButton, Toggle, Logo, ResizeHandles} from './components/Controls.jsx';
import {useAudio} from './hooks/useAudio.js';
import {useConnection} from './hooks/useConnection.js';
import {usePhoneVideo} from './hooks/usePhoneVideo.js';
import {FrameRate} from './components/FrameRate.jsx';
import {AppsModal} from './components/AppsModal.jsx';
import {InspectorContent} from './components/InspectorContent.jsx';
import React, {useEffect, useRef, useState} from 'react';
import {Smartphone, Pin, Minus, X, Maximize2, Home, LockKeyhole, Volume2, VolumeX, Camera, CameraOff, Play, Mouse, ArrowLeft, ArrowRight, Keyboard, Scan, Palette, Clipboard, ExternalLink, ChevronRight, Cable, CircleHelp, GripHorizontal, Monitor, LoaderCircle, RotateCw, ChevronLeft, LogOut, Moon, Sun, Layers} from 'lucide-react';
import {rotateDevice} from './orientation.js';
import './style.css';


const platformLabel = navigator.userAgent.includes('Windows') ? 'Windows' : navigator.userAgent.includes('Linux') ? 'Linux' : 'tu sistema';
const sections = [[Smartphone, 'phone', 'Pantalla'], [Volume2, 'audio', 'Audio'], [Clipboard, 'clipboard', 'Portapapeles'], [Palette, 'appearance', 'Apariencia'], [CircleHelp, 'help', 'Ayuda']];
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
  const [videoQuality, setVideoQuality] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlQuality = params.get('quality');
      if (urlQuality && ['economy', 'balanced', 'detail'].includes(urlQuality)) return urlQuality;
    }
    const saved = localStorage.getItem('videoQuality');
    return ['economy', 'balanced', 'detail'].includes(saved) ? saved : 'balanced';
  });
  const [forceSoftware, setForceSoftware] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('software')) {
        const val = params.get('software');
        return val === '1' || val === 'true';
      }
    }
    return localStorage.getItem('forceSoftware') === 'true';
  });
  useEffect(() => { localStorage.setItem('videoQuality', videoQuality); }, [videoQuality]);
  useEffect(() => { localStorage.setItem('forceSoftware', String(forceSoftware)); }, [forceSoftware]);
  const [showApps, setShowApps] = useState(false);
  const [deviceApps, setDeviceApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [launchingApp, setLaunchingApp] = useState(null);
  async function appSwitcher() {
    if (!connected) return;
    try {
      if (input.current?.swipe) {
        await input.current.swipe('switcher');
      } else {
        await post('/app-switcher', {});
      }
      setNotice('Selector de apps (multitarea) activado.');
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function loadDeviceApps() {
    if (!connected || loadingApps) return;
    setLoadingApps(true);
    try {
      const res = await fetch('/apps');
      if (!res.ok) throw new Error('No se pudo obtener la lista de aplicaciones.');
      const data = await res.json();
      setDeviceApps(Array.isArray(data) ? data : []);
      setShowApps(true);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setLoadingApps(false);
    }
  }
  async function launchDeviceApp(app) {
    if (!connected || launchingApp) return;
    setLaunchingApp(app.bundle_id);
    try {
      await post('/apps/launch', {bundle_id: app.bundle_id});
      setShowApps(false);
      setNotice(`Abriendo ${app.name} en el iPhone…`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setLaunchingApp(null);
    }
  }
  async function exportDiagnostics() {
    try {
      if (bridge) {
        const msg = await native('diagnostics');
        if (msg) setNotice(msg);
      } else {
        const res = await fetch('/diagnostics');
        if (!res.ok) throw new Error('No se pudo generar el diagnóstico.');
        const blob = new Blob([JSON.stringify(await res.json(), null, 2) + '\n'], {type: 'application/json'});
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.download = 'diagnostico-mirros.json'; link.href = url; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('Diagnóstico exportado.');
      }
    } catch (error) {
      setNotice(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    }
  }
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
  const [mediaPaused, setMediaPaused] = useState(false), [mediaPauseReason, setMediaPauseReason] = useState(null), [mediaBusy, setMediaBusy] = useState(false), [iosStyle, setIosStyle] = useState(null);
  const [cameraLive, setCameraLive] = useState(false), [takingPhoto, setTakingPhoto] = useState(false);
  const mediaBusyRef = useRef(false), mediaStateRef = useRef({paused: false, reason: null});
  const floating = state.mode === 'phone', connected = state.phase === 'conectado', controlsVisible = state.controlsVisible !== false;
  const {audioEnabled, audioStatus, volume, setVolume, toggleAudio} = useAudio(connected && !mediaPaused);
  const {dimensions, frames, live, videoStatus, rotation, video, videoMode} = usePhoneVideo(canvas, connected && !mediaPaused, floating, videoQuality, forceSoftware);
  function applyMediaState(paused, reason) {
    const nextReason = paused ? (reason || 'manual') : null;
    mediaStateRef.current = {paused, reason: nextReason};
    setMediaPaused(paused);
    setMediaPauseReason(nextReason);
  }
  useEffect(() => {
    if (!connected) {
      applyMediaState(false, null);
      setIosStyle(null);
      return;
    }
    let cancelled = false;
    const syncMediaState = () => {
      if (mediaBusyRef.current) return;
      fetch('/media-state', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(data => {
        if (cancelled || mediaBusyRef.current || !data || typeof data.paused !== 'boolean') return;
        const previous = mediaStateRef.current;
        if (previous.paused === data.paused && previous.reason === (data.paused ? data.reason || 'manual' : null)) return;
        if (data.paused && !previous.paused && data.reason === 'auto_sensor') {
          setNotice('Cámara detectada en el iPhone. Activando visor en vivo…');
        } else if (!data.paused && previous.paused && previous.reason === 'auto_sensor') {
          setNotice('Cámara cerrada en el iPhone. Pantalla reanudada a 60 FPS.');
        }
        applyMediaState(data.paused, data.reason);
      }).catch(() => {});
    };
    syncMediaState();
    const interval = setInterval(syncMediaState, 400);
    fetch('/style').then(r => r.ok ? r.json() : null).then(data => {
      if (!cancelled && data && (data.style === 'light' || data.style === 'dark')) setIosStyle(data.style);
    }).catch(() => {});
    return () => { cancelled = true; clearInterval(interval); };
  }, [connected]);
  async function toggleMediaPause(nextPaused = !mediaPaused, {exitApp = false} = {}) {
    if (!connected || mediaBusyRef.current) return false;
    mediaBusyRef.current = true;
    setMediaBusy(true);
    try {
      const res = await fetch('/media-state', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({paused: Boolean(nextPaused), exit_app: Boolean(exitApp && !nextPaused)}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.code === 'media_in_use') applyMediaState(true, body.reason || 'auto_sensor');
        throw new Error(body.message || body.error || 'No se pudo cambiar el estado de cámara y micrófono.');
      }
      applyMediaState(Boolean(nextPaused), body.reason || 'manual');
      setNotice(nextPaused
        ? 'Cámara y micrófono liberados en el iPhone. Pulsa Reanudar pantalla cuando termines.'
        : exitApp ? 'Cámara cerrada en el iPhone. Reanudando pantalla…' : 'Reanudando pantalla del iPhone…');
      return true;
    } catch (err) {
      setNotice(err.message);
      return false;
    } finally {
      mediaBusyRef.current = false;
      setMediaBusy(false);
    }
  }
  useEffect(() => {
    if (!connected || !mediaPaused) {
      setCameraLive(false);
      return;
    }
    let cancelled = false;
    const abort = new AbortController();

    async function streamCamera() {
      while (!cancelled) {
        try {
          const res = await fetch('/camera-frame', {
            signal: abort.signal,
            cache: 'no-store',
          });
          if (!res.ok) {
            await new Promise(r => setTimeout(r, 200));
            continue;
          }
          const blob = await res.blob();
          if (cancelled) break;
          const bitmap = await createImageBitmap(blob);
          if (cancelled) {
            bitmap.close();
            break;
          }
          const c = canvas.current;
          if (c) {
            if (c.width !== bitmap.width || c.height !== bitmap.height) {
              c.width = bitmap.width;
              c.height = bitmap.height;
            }
            const ctx = c.getContext('2d');
            if (ctx) {
              ctx.drawImage(bitmap, 0, 0);
              if (!cancelled) setCameraLive(true);
            }
          }
          bitmap.close();
        } catch {
          if (cancelled) break;
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    streamCamera();
    return () => {
      cancelled = true;
      abort.abort();
      setCameraLive(false);
    };
  }, [connected, mediaPaused]);
  async function handleCameraShutter() {
    if (takingPhoto) return;
    setTakingPhoto(true);
    try {
      const res = await fetch('/camera-shutter', {method: 'POST'});
      if (res.ok) {
        setNotice('Disparador activado (foto / video).');
      } else {
        button('volume-down');
      }
    } catch {
      button('volume-down');
    } finally {
      setTimeout(() => setTakingPhoto(false), 350);
    }
  }
  async function changeIosStyle(style) {
    if (!connected) return;
    try {
      const res = await fetch('/style', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({style}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo cambiar el aspecto de iOS.');
      setIosStyle(style);
      setNotice(`Aspecto ${style === 'dark' ? 'oscuro' : 'claro'} aplicado en el iPhone.`);
    } catch (err) {
      setNotice(err.message);
    }
  }
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
      setNotice(connected ? (mode === 'aod' ? 'Modo AOD / Reposo activo. La pantalla física descansa mientras el control sigue activo.' : 'Modo Pantalla Dual activo.') : 'Preferencia guardada para la próxima conexión.');
    } catch (err) {
      setNotice(err.message);
    }
  }
  async function wakePhone() {
    if (!connected) return;
    try {
      if (mediaPaused) {
        const resumed = await toggleMediaPause(false);
        if (!resumed) return;
      }
      if (bridge) await native('wake');
      else {
        await post('/wake', {});
        if (state.displayMode === 'aod') setState(v => ({...v, displayMode: 'dual'}));
      }
      setNotice('Despertando iPhone…');
    } catch (err) {
      setNotice(err.message);
    }
  }
  const input = usePhoneInput({canvas, connected, sensitivity, rotation, floating, onError: setNotice, button, capture, setKeyboard, clipboardShortcut: runClipboardShortcut, wake: wakePhone, appSwitcher});
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timeout); }, [notice]);
  function button(name) { if (connected) post('/button', {name, state: 'press'}).catch(error => setNotice(error.message)); }
  async function phoneAudioButton(name) {
    if (!connected) return;
    try { await post('/button', {name, state: 'press'}); setNotice(name === 'mute' ? 'Botón Silencio enviado al iPhone. Comprueba el resultado en iOS.' : 'Volumen del iPhone ajustado.'); }
    catch (error) { setNotice(error.message); }
  }
  async function capture() {
    if ((!live && !cameraLive) || !canvas.current) return;
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
  const isDisplaying = live || cameraLive;
  const preview = <div className={`preview-stage ${floating ? 'is-floating' : ''}`} ref={stage}>
    <div className={`phone-shell ${isDisplaying ? 'is-live' : ''}`} style={{width: phoneSize.width + 12, height: phoneSize.height + 12, '--phone-radius': `${Math.round(Math.min(phoneSize.width, phoneSize.height) * .125)}px`}}>
      <canvas ref={canvas} tabIndex={0} onPointerMove={trackPointer} onPointerLeave={() => setPointerPosition(null)} aria-label="Pantalla del iPhone. Clic para tocar, arrastra para deslizar y usa la rueda para desplazarte." style={{width: phoneSize.width, height: phoneSize.height}}/>
      {pointerPosition && <span className={`phone-pointer pointer-${pointer.shape}`} aria-hidden="true" style={{left: pointerPosition.x, top: pointerPosition.y, '--pointer-color': pointer.color, '--pointer-scale': pointer.size / 100}}/>}
      {cameraLive && <>
        <div className="camera-live-overlay-top">
          <span className="camera-dot" />
          <span>Cámara y micro en vivo · Control táctil activo</span>
        </div>
        <div className="camera-live-overlay-bottom">
          <button
            type="button"
            className={`camera-shutter-btn ${takingPhoto ? 'shutter-active' : ''}`}
            onClick={handleCameraShutter}
            title="Tomar foto / Iniciar video (o pulsa la pantalla)"
            aria-label="Disparador de cámara"
          >
            <span className="camera-shutter-inner" />
          </button>
          <button
            type="button"
            className="camera-exit-btn"
            onClick={() => toggleMediaPause(false, {exitApp: true})}
          >
            Salir de Cámara
          </button>
        </div>
      </>}
      {connected && state.displayMode === 'aod' && isDisplaying && (
        <div className="aod-live-badge" title="Modo AOD / Reposo: la pantalla física descansa. Control e interacción activos en el PC.">
          <Moon size={12} />
          <span>AOD Activo</span>
          <button type="button" className="aod-badge-btn" onClick={wakePhone} title="Despertar pantalla física (Ctrl+U)">
            Despertar
          </button>
        </div>
      )}
      {!isDisplaying && <div className="phone-placeholder"><div className="placeholder-symbol">{connected && mediaPaused ? <CameraOff size={26}/> : connected && state.displayMode === 'aod' ? <Moon size={26}/> : connected || state.phase === 'preparando' ? <LoaderCircle size={26} className="spin"/> : <Cable size={28}/>}</div><strong>{state.phase === 'pausado' ? 'Sesión terminada' : state.phase === 'error' ? 'Conexión interrumpida' : state.phase === 'preparando' ? 'Preparando iPhone' : connected && mediaPaused ? 'Cargando visor en vivo…' : connected && state.displayMode === 'aod' ? 'iPhone en reposo' : connected ? 'Cargando pantalla' : 'iPhone desconectado'}</strong><span>{state.phase === 'pausado' ? 'Puedes retirar el cable o volver a conectar.' : connected && mediaPaused ? 'Conectando con el visor en vivo para que uses cámara y micrófono desde el computador.' : connected && state.displayMode === 'aod' ? 'Captura en espera durante el reposo. Despierta el iPhone para continuar.' : connected ? videoStatus : state.phase === 'preparando' ? 'Mantén el cable conectado.' : 'Conecta el cable USB y desbloquea el teléfono.'}</span>{['error','pausado'].includes(state.phase) && <button className="small-button" onClick={() => native('retry')}>Reintentar</button>}{connected && mediaPaused && <div className="placeholder-actions"><button className="small-button" disabled={mediaBusy} onClick={() => toggleMediaPause(false, {exitApp: true})}>Salir de Cámara y reanudar</button><button className="small-button" disabled={mediaBusy} onClick={() => toggleMediaPause(false)}>Reanudar pantalla</button></div>}{connected && !mediaPaused && state.displayMode === 'aod' && <button className="small-button" onClick={wakePhone}>Despertar iPhone</button>}<span className="placeholder-line"/></div>}
    </div>
    <div className={`controls-panel ${controlsVisible ? 'expanded' : 'collapsed'}`} style={{height: phoneSize.height + 12}}>
      <button className="controls-tab" aria-label={controlsVisible ? 'Guardar controles' : 'Desplegar controles'} aria-expanded={controlsVisible} title={controlsVisible ? 'Guardar controles' : 'Desplegar controles'} onClick={toggleControls}>{controlsVisible ? <ChevronLeft size={13}/> : <ChevronRight size={13}/>}</button>
      <div className="controls-drawer" inert={!controlsVisible} aria-hidden={!controlsVisible}>
        <div className="phone-controls" role="toolbar" aria-label="Controles del iPhone" aria-orientation="vertical">
          <IconButton icon={X} label="Salir de Mirros" onClick={() => native('close')} disabled={!bridge}/>
          <IconButton icon={ArrowLeft} label="Deslizar a la izquierda" disabled={!connected} onClick={() => input.current?.swipe('left')}/>
          <IconButton icon={ArrowRight} label="Deslizar a la derecha" disabled={!connected} onClick={() => input.current?.swipe('right')}/>
          <IconButton icon={Home} label="Inicio · Ctrl+H" disabled={!connected} onClick={() => button('home')}/>
          <IconButton icon={Layers} label="Selector de apps · Ctrl+M" disabled={!connected} onClick={appSwitcher}/>
          <span className="control-separator"/>
          <IconButton icon={RotateCw} label="Girar vista 90°" disabled={!connected || rotating} onClick={rotatePhone}/>
          <IconButton icon={Maximize2} label="Usar todo el alto disponible" disabled={!bridge} onClick={() => native('fitHeight')}/>
          <IconButton icon={floating ? Monitor : ExternalLink} label={floating ? 'Abrir panel' : 'Ventana flotante'} disabled={!bridge} onClick={() => native('mode', floating ? 'studio' : 'phone')}/>
          <IconButton icon={Pin} label="Siempre encima" active={state.alwaysOnTop} disabled={!bridge} onClick={() => native('pin', !state.alwaysOnTop)}/>
          <span className="control-separator"/>
          <IconButton icon={audioEnabled ? Volume2 : VolumeX} label={audioEnabled ? 'Desactivar audio del PC' : 'Activar audio del PC'} active={audioEnabled} onClick={toggleAudio}/>
          <IconButton icon={VolumeX} label="Alternar silencio del iPhone" disabled={!connected} onClick={() => phoneAudioButton('mute')}/>
          <IconButton icon={Camera} label="Guardar captura · Ctrl+P" disabled={!isDisplaying} onClick={capture}/>
          <IconButton icon={mediaPaused ? Play : CameraOff} label={mediaPaused ? 'Reanudar pantalla del iPhone' : 'Liberar cámara y micrófono del iPhone'} active={mediaPaused} disabled={!connected || mediaBusy} onClick={() => toggleMediaPause(!mediaPaused)}/>
          <span className="control-separator"/>
          <IconButton icon={state.displayMode === 'aod' ? Sun : Moon} label={state.displayMode === 'aod' ? 'Modo actual: reposo / AOD (clic para Pantalla Dual)' : 'Modo AOD / Reposo (pantalla física descansa)'} active={state.displayMode === 'aod'} disabled={!connected} onClick={() => setDisplayMode(state.displayMode === 'aod' ? 'dual' : 'aod')}/>
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
        <section className="viewer" aria-label="Vista del iPhone"><div className="viewer-heading"><span className={`connection-pill ${connected ? 'connected' : ''}`}><i/>{connected ? 'USB conectado' : statusLabel}</span><span className="stream-info">{live ? <>{videoMode && <span className={`engine-badge ${videoMode}`} title={videoMode === 'software' ? 'Decodificación compatible por software' : 'Decodificación nativa HEVC'}>{videoMode === 'software' ? `Compatible (${{economy: 'Ahorro', balanced: 'Equilibrado', detail: 'Detalle'}[videoQuality] || 'Soft'})` : 'HEVC'}</span>}<FrameRate frames={frames}/> · {dimensions.width} × {dimensions.height}</> : cameraLive ? <><span className="engine-badge detail" title="Visor en directo vía DVT Instruments">Cámara</span> · Directo DVT</> : 'Vista en directo'}</span></div>{preview}<div className="viewer-hints"><span><Mouse size={13}/>Clic y arrastrar</span><span><Scan size={13}/>Rueda para desplazar</span><span><Keyboard size={13}/>{keyboard ? 'Teclado activo' : 'Clic para escribir'}</span></div></section>
        <aside className="inspector" aria-label={currentSection[2]}><div className="inspector-heading"><span className="section-symbol"><SectionIcon size={20}/></span><div><h1>{currentSection[2]}</h1><p>{{phone: 'Dispositivo y ventana', audio: 'Salidas y volumen', clipboard: 'Copiar y enviar contenido', appearance: 'Tema, tamaño y gestos', help: 'Conexión y atajos'}[tab]}</p></div></div>
          <InspectorContent
            tab={tab} state={state} connected={connected} live={live} bridge={bridge} native={native}
            videoMode={videoMode} videoQuality={videoQuality} setVideoQuality={setVideoQuality} forceSoftware={forceSoftware} setForceSoftware={setForceSoftware}
            mediaPaused={mediaPaused} mediaPauseReason={mediaPauseReason} mediaBusy={mediaBusy} toggleMediaPause={toggleMediaPause} iosStyle={iosStyle} changeIosStyle={changeIosStyle}
            loadingApps={loadingApps} loadDeviceApps={loadDeviceApps} appSwitcher={appSwitcher} setDisplayMode={setDisplayMode} wakePhone={wakePhone} rotatePhone={rotatePhone} rotating={rotating}
            button={button} capture={capture} audioEnabled={audioEnabled} audioStatus={audioStatus} volume={volume} setVolume={setVolume} toggleAudio={toggleAudio} phoneAudioButton={phoneAudioButton}
            platformLabel={platformLabel} clipboardBusy={clipboardBusy} shareClipboard={shareClipboard} text={text} setText={setText} sendText={sendText}
            setTheme={setTheme} sensitivity={sensitivity} setSensitivity={setSensitivity} pointer={pointer} updatePointer={updatePointer} exportDiagnostics={exportDiagnostics}
          />
        </aside>
      </div>
      <footer className="statusbar"><span className={state.phase === 'error' ? 'error-text' : ''}><i className={connected ? 'connected' : ''}/>{connected ? `${state.device?.name || 'iPhone'} conectado por USB` : state.message}</span><span>{audioEnabled ? <Volume2 size={12}/> : <VolumeX size={12}/>}Audio PC {audioEnabled ? 'activado' : 'desactivado'}</span></footer>
    </div>
    {state.phase === 'seleccion' && <div className="modal-backdrop"><section className="device-picker"><h2>Seleccionar iPhone</h2>{state.devices.map(device => <button key={device.udid} onClick={() => native('device', device.udid)}><Smartphone size={18}/>{device.name}<ChevronRight size={15}/></button>)}</section></div>}
    {showApps && <AppsModal apps={deviceApps} loadingApps={loadingApps} launchingApp={launchingApp} onLaunch={launchDeviceApp} onRefresh={loadDeviceApps} onClose={() => setShowApps(false)}/>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}
