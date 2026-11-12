import {post} from './transport.js';
import {usePhoneInput} from './hooks/usePhoneInput.js';
import {bridge, native} from './bridge.js';
import {IconButton, Toggle, Logo, ResizeHandles, RecordButton, RecordingBadge} from './components/Controls.jsx';
import {createRecorder} from './recorder.mjs';
import {useAudio} from './hooks/useAudio.js';
import {useConnection} from './hooks/useConnection.js';
import {usePhoneVideo} from './hooks/usePhoneVideo.js';
import {FrameRate} from './components/FrameRate.jsx';
import {AppsModal} from './components/AppsModal.jsx';
import {InspectorContent} from './components/InspectorContent.jsx';
import {useLanguage, translateBackendText} from './i18n.js';
import React, {useEffect, useRef, useState} from 'react';
import {Smartphone, Pin, Minus, X, Maximize2, Home, LockKeyhole, Volume2, VolumeX, Camera, CameraOff, Play, Mouse, ArrowLeft, ArrowRight, Keyboard, Scan, Palette, Clipboard, ExternalLink, ChevronRight, Cable, CircleHelp, GripHorizontal, Monitor, LoaderCircle, RotateCw, ChevronLeft, LogOut, Moon, Sun, Layers, Battery, BatteryCharging, BatteryLow, BatteryMedium, BatteryFull, SlidersHorizontal, Bell, Languages} from 'lucide-react';
import {resolveBatteryIcon} from './battery.mjs';
import {rotateDevice} from './orientation.js';
import './style.css';

const BATTERY_ICONS = {Battery, BatteryCharging, BatteryLow, BatteryMedium, BatteryFull};
const sectionDefs = [[Smartphone, 'phone'], [Volume2, 'audio'], [Clipboard, 'clipboard'], [Palette, 'appearance'], [CircleHelp, 'help']];

export default function App() {
  const {lang, setLang, toggleLang, t} = useLanguage();
  const platformLabel = navigator.userAgent.includes('Windows') ? 'Windows' : navigator.userAgent.includes('Linux') ? 'Linux' : t.yourSystem;
  const sections = sectionDefs.map(([Icon, id]) => [Icon, id, t.sections[id][0]]);
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
      setNotice(t.notices.appSwitcher);
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function controlCenterSwipe() {
    if (!connected) return;
    try {
      await input.current?.swipe('controlCenter');
      setNotice(t.notices.controlCenter);
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function notificationsSwipe() {
    if (!connected) return;
    try {
      await input.current?.swipe('notifications');
      setNotice(t.notices.notifications);
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function loadDeviceApps() {
    if (!connected || loadingApps) return;
    setLoadingApps(true);
    try {
      const res = await fetch('/apps');
      if (!res.ok) throw new Error(t.notices.appsLoadFailed);
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
      setNotice(t.notices.launchingApp(app.name));
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
        if (msg) setNotice(translateBackendText(msg, lang));
      } else {
        const res = await fetch('/diagnostics');
        if (!res.ok) throw new Error(t.notices.diagnosticsFailed);
        const blob = new Blob([JSON.stringify(await res.json(), null, 2) + '\n'], {type: 'application/json'});
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.download = 'mirros-diagnostics.json'; link.href = url; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice(t.notices.diagnosticsExported);
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
      if (result.currentDeviceOrientation === 'portrait') setNotice(t.notices.rotatedPortraitKept);
    }
    catch { setNotice(t.notices.rotatedDeclined); }
    finally { setRotating(false); }
  }
  const [clipboardBusy, setClipboardBusy] = useState(false);
  async function shareClipboard(direction) {
    setClipboardBusy(true);
    try { setNotice(translateBackendText(await native('clipboard', direction), lang)); }
    catch (error) { setNotice(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setClipboardBusy(false); }
  }
  const clipboardLock = useRef(false);
  async function runClipboardShortcut(action) {
    if (clipboardLock.current || !connected || !bridge) return;
    clipboardLock.current = true; setClipboardBusy(true);
    try { setNotice(translateBackendText(await native('clipboardShortcut', action), lang)); }
    catch (error) { setNotice(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { clipboardLock.current = false; setClipboardBusy(false); }
  }
  const canvas = useRef(null), stage = useRef(null), [phoneSize, setPhoneSize] = useState({width: 280, height: 610});
  const [mediaPaused, setMediaPaused] = useState(false), [mediaPauseReason, setMediaPauseReason] = useState(null), [mediaBusy, setMediaBusy] = useState(false), [iosStyle, setIosStyle] = useState(null);
  const [accessibility, setAccessibility] = useState({reduce_motion: false, reduce_transparency: false, increase_contrast: false});
  const [accessibilityBusy, setAccessibilityBusy] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const mediaBusyRef = useRef(false), mediaStateRef = useRef({paused: false, reason: null});
  const floating = state.mode === 'phone', connected = state.phase === 'conectado', controlsVisible = state.controlsVisible !== false;
  const [battery, setBattery] = useState({capacity: null, charging: false, connected: false});
  useEffect(() => {
    if (!connected) {
      setBattery({capacity: null, charging: false, connected: false});
      return;
    }
    let cancelled = false;
    const pollBattery = async () => {
      try {
        const res = await fetch('/battery', {cache: 'no-store'});
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data && typeof data === 'object') {
          setBattery({
            capacity: typeof data.capacity === 'number' ? data.capacity : null,
            charging: Boolean(data.charging),
            connected: Boolean(data.connected),
          });
        }
      } catch {}
    };
    pollBattery();
    const interval = setInterval(pollBattery, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connected]);

  const {audioEnabled, audioStatus, volume, setVolume, toggleAudio, getAudioStream} = useAudio(connected && !mediaPaused);
  const recorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingLock = useRef(false);

  async function toggleRecording() {
    if (recordingLock.current) return;
    recordingLock.current = true;
    setTimeout(() => { recordingLock.current = false; }, 300);

    if (recorderRef.current) {
      const active = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      try {
        setNotice(t.notices.recordingStopping);
        const {blob, extension} = await active.stop();
        if (!blob || (blob.size === 0 && (!blob.byteLength || blob.byteLength === 0))) {
          setNotice(t.notices.recordingEmpty);
          return;
        }
        if (bridge) {
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const saved = await native('saveRecording', {bytes, extension});
          if (saved) setNotice(t.notices.recordingSaved);
          else setNotice(t.notices.recordingCanceled);
        } else {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `MirrOS-Recording.${extension}`;
          link.href = url;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setNotice(t.notices.recordingDownloaded);
        }
      } catch (err) {
        setNotice(t.notices.recordingSaveError(err.message));
      } finally {
        setRecordingDuration(0);
      }
    } else {
      if ((!live && !cameraLive) || !canvas.current) {
        setNotice(t.notices.noActiveStreamToRecord);
        return;
      }
      try {
        const audioStream = getAudioStream?.();
        const rec = createRecorder({
          canvas: canvas.current,
          audioStream,
          onTick: secs => setRecordingDuration(secs),
        });
        recorderRef.current = rec;
        setRecording(true);
        setRecordingDuration(0);
        setNotice(t.notices.recordingStarted);
      } catch (err) {
        setNotice(t.notices.recordingStartError(err.message));
      }
    }
  }

  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.stop().catch(() => {});
        recorderRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!connected && recorderRef.current) {
      toggleRecording();
    }
  }, [connected]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'F11') {
        event.preventDefault();
        if (bridge) {
          native('fullscreen');
        } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key?.toLowerCase() === 'r' || event.code === 'KeyR')) {
        event.preventDefault();
        toggleRecording();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
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
          setNotice(t.notices.cameraDetected);
        } else if (!data.paused && previous.paused && previous.reason === 'auto_sensor') {
          setNotice(t.notices.cameraClosed);
        }
        applyMediaState(data.paused, data.reason);
      }).catch(() => {});
    };
    syncMediaState();
    const interval = setInterval(syncMediaState, 400);
    fetch('/style').then(r => r.ok ? r.json() : null).then(data => {
      if (!cancelled && data && (data.style === 'light' || data.style === 'dark')) setIosStyle(data.style);
    }).catch(() => {});
    fetch('/accessibility', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(data => {
      if (cancelled || !data || !Array.isArray(data.settings)) return;
      const next = {reduce_motion: false, reduce_transparency: false, increase_contrast: false};
      for (const item of data.settings) {
        if (item && typeof item.key === 'string' && item.key in next) {
          next[item.key] = Boolean(item.value);
        }
      }
      setAccessibility(next);
    }).catch(() => {});
    return () => { cancelled = true; clearInterval(interval); };
  }, [connected, t]);
  async function toggleAccessibility(key, nextValue = !accessibility[key]) {
    if (!connected || accessibilityBusy) return;
    setAccessibilityBusy(true);
    try {
      const res = await fetch('/accessibility/set', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({key, value: Boolean(nextValue)}),
      });
      if (!res.ok) throw new Error(t.notices.accessibilityUpdateFailed);
      setAccessibility(prev => ({...prev, [key]: Boolean(nextValue)}));
      const label = t.notices.accessibilityLabels[key] || key;
      setNotice(t.notices.accessibilityUpdated(label, nextValue));
    } catch (err) {
      setNotice(err.message);
    } finally {
      setAccessibilityBusy(false);
    }
  }
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
        throw new Error(body.message || body.error || t.notices.mediaToggleFailed);
      }
      applyMediaState(Boolean(nextPaused), body.reason || 'manual');
      setNotice(nextPaused
        ? t.notices.mediaReleased
        : exitApp ? t.notices.mediaClosingCamera : t.notices.mediaResuming);
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
  async function changeIosStyle(style) {
    if (!connected) return;
    try {
      const res = await fetch('/style', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({style}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || t.notices.iosStyleFailed);
      setIosStyle(style);
      setNotice(t.notices.iosStyleApplied(style === 'dark'));
    } catch (err) {
      setNotice(err.message);
    }
  }
  function toggleControls() { if (bridge) native('controls', !controlsVisible); else setState(value => ({...value, controlsVisible: !controlsVisible})); }
  function switchMode(nextMode) {
    if (bridge) {
      native('mode', nextMode);
    } else {
      setState(value => ({...value, mode: nextMode}));
      try {
        if (nextMode === 'studio') window.resizeTo?.(1120, 800);
        else window.resizeTo?.(410, 860);
      } catch {}
    }
  }
  async function disconnectSession() {
    if (bridge) {
      native('disconnect');
      return;
    }
    try {
      await post('/session/end', {});
    } catch {}
    setState(value => ({...value, phase: 'pausado', message: t.status.paused}));
    try { window.close(); } catch {}
  }
  async function closeApp() {
    if (bridge) {
      native('close');
      return;
    }
    await disconnectSession();
  }
  useEffect(() => {
    document.body.classList.toggle('floating', floating);
    document.body.classList.toggle('is-browser', !bridge);
  }, [floating]);
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
    if (event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom) {
      setPointerPosition(null);
      return;
    }
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
      setNotice(connected ? (mode === 'aod' ? t.notices.displayModeAod : t.notices.displayModeDual) : t.notices.displayModeSaved);
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
      setNotice(t.notices.wakingPhone);
    } catch (err) {
      setNotice(err.message);
    }
  }
  const input = usePhoneInput({canvas, connected, sensitivity, rotation, floating, onError: setNotice, button, capture, setKeyboard, clipboardShortcut: runClipboardShortcut, wake: wakePhone, appSwitcher, toggleRecording});
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timeout); }, [notice]);
  function button(name) { if (connected) post('/button', {name, state: 'press'}).catch(error => setNotice(error.message)); }
  async function phoneAudioButton(name) {
    if (!connected) return;
    try { await post('/button', {name, state: 'press'}); setNotice(name === 'mute' ? t.notices.muteSent : t.notices.volumeAdjusted); }
    catch (error) { setNotice(error.message); }
  }
  async function capture() {
    if ((!live && !cameraLive) || !canvas.current) return;
    try {
      const image = await new Promise((resolve, reject) => canvas.current.toBlob(blob => blob ? resolve(blob) : reject(new Error(t.notices.captureFailed)), 'image/png'));
      if (bridge) {
        if (await native('saveCapture', new Uint8Array(await image.arrayBuffer()))) setNotice(t.notices.captureSaved);
      } else {
        const url = URL.createObjectURL(image), link = document.createElement('a');
        link.download = 'MirrOS.png'; link.href = url; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) { setNotice(error.message); }
  }
  async function sendText(event) {
    event.preventDefault(); if (!text.trim()) return;
    try { await post('/clipboard', {text}); await post('/key', {usages: [227, 25]}); await post('/key', {usages: []}); setText(''); setNotice(t.notices.textSent); } catch (error) { setNotice(error.message); }
  }
  const isDisplaying = live || cameraLive;
  const preview = <div className={`preview-stage ${floating ? 'is-floating' : ''}`} ref={stage}>
    <div className={`phone-shell ${isDisplaying ? 'is-live' : ''}`} style={{width: phoneSize.width + 12, height: phoneSize.height + 12, '--phone-radius': `${Math.round(Math.min(phoneSize.width, phoneSize.height) * .125)}px`}}>
      <canvas ref={canvas} tabIndex={0} onPointerMove={trackPointer} onPointerLeave={() => setPointerPosition(null)} onPointerCancel={() => setPointerPosition(null)} onLostPointerCapture={() => setPointerPosition(null)} aria-label={t.preview.canvasAria} style={{width: phoneSize.width, height: phoneSize.height}}/>
      {pointerPosition && <span className={`phone-pointer pointer-${pointer.shape}`} aria-hidden="true" style={{left: pointerPosition.x, top: pointerPosition.y, '--pointer-color': pointer.color, '--pointer-scale': pointer.size / 100}}/>}
      {cameraLive && (
        <div className="camera-live-overlay-top">
          <span className="camera-dot" />
          <span>{t.preview.liveCamera}</span>
        </div>
      )}
      {connected && state.displayMode === 'aod' && isDisplaying && (
        <div className="aod-live-badge" title={t.preview.aodTitle}>
          <Moon size={12} />
          <span>{t.preview.aodActive}</span>
          <button type="button" className="aod-badge-btn" onClick={wakePhone} title={t.preview.wakeTitle}>
            {t.preview.wakeBtn}
          </button>
        </div>
      )}
      {connected && battery && battery.capacity !== null && floating && (
        <div
          className={`floating-battery-badge ${battery.charging ? 'is-charging' : ''} ${battery.capacity <= 20 ? 'is-low' : ''}`}
          title={t.preview.batteryTitle(battery.capacity, battery.charging)}
        >
          {React.createElement(resolveBatteryIcon(BATTERY_ICONS, battery.capacity, battery.charging), {size: 13})}
          <span>{battery.capacity}%</span>
        </div>
      )}
      {recording && (
        <RecordingBadge
          duration={recordingDuration}
          onStop={toggleRecording}
          className="phone-overlay-recording"
          t={t}
        />
      )}
      {!isDisplaying && <div className="phone-placeholder"><div className="placeholder-symbol">{connected && mediaPaused ? <CameraOff size={26}/> : connected && state.displayMode === 'aod' ? <Moon size={26}/> : connected || state.phase === 'preparando' ? <LoaderCircle size={26} className="spin"/> : <Cable size={28}/>}</div><strong>{state.phase === 'pausado' ? t.preview.placeholderTitle.paused : state.phase === 'error' ? t.preview.placeholderTitle.error : state.phase === 'preparando' ? t.preview.placeholderTitle.preparing : connected && mediaPaused ? t.preview.placeholderTitle.mediaPaused : connected && state.displayMode === 'aod' ? t.preview.placeholderTitle.aod : connected ? t.preview.placeholderTitle.loading : t.preview.placeholderTitle.disconnected}</strong><span>{state.phase === 'pausado' ? t.preview.placeholderSub.paused : connected && mediaPaused ? t.preview.placeholderSub.mediaPaused : connected && state.displayMode === 'aod' ? t.preview.placeholderSub.aod : connected ? translateBackendText(videoStatus, lang) : state.phase === 'preparando' ? t.preview.placeholderSub.preparing : t.preview.placeholderSub.disconnected}</span>{['error','pausado'].includes(state.phase) && <button className="small-button" onClick={() => native('retry')}>{t.preview.retry}</button>}{connected && mediaPaused && <div className="placeholder-actions"><button className="small-button" disabled={mediaBusy} onClick={() => toggleMediaPause(false, {exitApp: true})}>{t.preview.exitCameraResume}</button><button className="small-button" disabled={mediaBusy} onClick={() => toggleMediaPause(false)}>{t.preview.resumeScreen}</button></div>}{connected && !mediaPaused && state.displayMode === 'aod' && <button className="small-button" onClick={wakePhone}>{t.preview.wakeIphone}</button>}<span className="placeholder-line"/></div>}
    </div>
    <div className={`controls-panel ${controlsVisible ? 'expanded' : 'collapsed'}`} style={{height: phoneSize.height + 12}}>
      <button className="controls-tab" aria-label={controlsVisible ? t.controls.collapse : t.controls.expand} aria-expanded={controlsVisible} title={controlsVisible ? t.controls.collapse : t.controls.expand} onClick={toggleControls}>{controlsVisible ? <ChevronLeft size={13}/> : <ChevronRight size={13}/>}</button>
      <div className="controls-drawer" inert={!controlsVisible} aria-hidden={!controlsVisible}>
        <div className="phone-controls" role="toolbar" aria-label={t.controls.toolbarAria} aria-orientation="vertical">
          <IconButton icon={X} label={t.controls.quit} onClick={closeApp}/>
          <IconButton icon={ArrowLeft} label={t.controls.swipeLeft} disabled={!connected} onClick={() => input.current?.swipe('left')}/>
          <IconButton icon={ArrowRight} label={t.controls.swipeRight} disabled={!connected} onClick={() => input.current?.swipe('right')}/>
          <IconButton icon={Home} label={t.controls.home} disabled={!connected} onClick={() => button('home')}/>
          <IconButton icon={Layers} label={t.controls.appSwitcher} disabled={!connected} onClick={appSwitcher}/>
          <IconButton icon={SlidersHorizontal} label={t.controls.controlCenter} disabled={!connected} onClick={controlCenterSwipe}/>
          <IconButton icon={Bell} label={t.controls.notifications} disabled={!connected} onClick={notificationsSwipe}/>
          <span className="control-separator"/>
          <IconButton icon={RotateCw} label={t.controls.rotate} disabled={!connected || rotating} onClick={rotatePhone}/>
          {bridge && <IconButton icon={Maximize2} label={t.controls.fitHeight} onClick={() => native('fitHeight')}/>}
          <IconButton icon={floating ? Monitor : ExternalLink} label={floating ? t.controls.openStudio : t.controls.phoneOnlyView} onClick={() => switchMode(floating ? 'studio' : 'phone')}/>
          <IconButton icon={Languages} label={t.controls.switchLang} active={lang === 'es'} onClick={toggleLang}/>
          {bridge && <IconButton icon={Pin} label={t.controls.alwaysOnTop} active={state.alwaysOnTop} onClick={() => native('pin', !state.alwaysOnTop)}/>}
          <span className="control-separator"/>
          <IconButton icon={audioEnabled ? Volume2 : VolumeX} label={audioEnabled ? t.controls.mutePc : t.controls.unmutePc} active={audioEnabled} onClick={toggleAudio}/>
          <IconButton icon={VolumeX} label={t.controls.toggleIphoneMute} disabled={!connected} onClick={() => phoneAudioButton('mute')}/>
          <IconButton icon={Camera} label={t.controls.screenshot} disabled={!isDisplaying} onClick={capture}/>
          <RecordButton recording={recording} disabled={!isDisplaying && !recording} onClick={toggleRecording} t={t}/>
          <IconButton icon={mediaPaused ? Play : CameraOff} label={mediaPaused ? t.controls.resumeIphoneScreen : t.controls.releaseCamMic} active={mediaPaused} disabled={!connected || mediaBusy} onClick={() => toggleMediaPause(!mediaPaused)}/>
          <span className="control-separator"/>
          <IconButton icon={state.displayMode === 'aod' ? Sun : Moon} label={state.displayMode === 'aod' ? t.controls.aodCurrent : t.controls.aodEnable} active={state.displayMode === 'aod'} disabled={!connected} onClick={() => setDisplayMode(state.displayMode === 'aod' ? 'dual' : 'aod')}/>
          <IconButton icon={Sun} label={t.controls.wakeShortcut} disabled={!connected} onClick={wakePhone}/>
          <IconButton icon={LockKeyhole} label={t.controls.lockShortcut} disabled={!connected} onClick={() => button('lock')}/>
          <IconButton icon={LogOut} label={t.controls.safeDisconnect} disabled={!connected} onClick={disconnectSession}/>
          {bridge && <IconButton icon={Minus} label={t.controls.minimize} onClick={() => native('minimize')}/>}
          {floating && bridge && <span className="control-drag" title={t.controls.dragWindow}><GripHorizontal size={16}/></span>}
        </div>
      </div>
    </div>
  </div>;
  const statusLabel = connected ? t.status.connected : state.phase === 'preparando' ? t.status.preparing : state.phase === 'pausado' ? t.status.paused : state.phase === 'error' ? t.status.error : t.status.disconnected;
  const currentSection = sections.find(([, id]) => id === tab);
  const SectionIcon = currentSection[0];
  if (floating) return <div className="floating-app" data-audio-status={audioStatus}>{preview}{bridge && <ResizeHandles t={t}/>}{notice && <div className="floating-notice" role="status">{notice}</div>}</div>;
  return <div className="studio">
    <aside className="sidebar">
      <div className="sidebar-brand"><Logo/></div>
      <div className="sidebar-label">{t.studio.deviceHeader}</div>
      <div className={`sidebar-device ${connected ? 'connected' : ''}`}>
        <div className="device-avatar"><Smartphone size={20}/></div>
        <div>
          <strong>{state.device?.name || 'iPhone'}</strong>
          {state.device?.model && <small className="device-model-label">{state.device.model}</small>}
          <small><i/>{statusLabel}{connected && battery && battery.capacity !== null ? ` · ${battery.capacity}%` : ''}</small>
        </div>
      </div>
      <div className="sidebar-label">{t.studio.controlsHeader}</div>
      <nav aria-label={t.studio.sectionsAria}>{sections.map(([Icon, id, label]) => <button key={id} className={tab === id ? 'selected' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={17}/><span>{label}</span>{tab === id && <span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="floating-launch" onClick={() => switchMode('phone')}><ExternalLink size={16}/><span>{t.studio.phoneOnlyBtn}</span></button><div className="sidebar-app-info"><span>Mirros</span><span>{state.version?.split('.').slice(0,2).join('.') || '—'} · USB</span></div></div>
    </aside>
    <div className="workspace">
      <header className="toolbar">
        <div className="toolbar-title">
          <strong>{state.device?.name || 'iPhone'}</strong>
          {state.device?.model && <span className="device-model-badge">{state.device.model}</span>}
          <ChevronRight size={14}/>
          <span>{currentSection[2]}</span>
        </div>
        {recording && <RecordingBadge duration={recordingDuration} onStop={toggleRecording} t={t} />}
        {connected && battery && battery.capacity !== null && (
          <div
            className={`battery-pill ${battery.charging ? 'is-charging' : ''} ${battery.capacity <= 20 ? 'is-low' : ''}`}
            title={t.preview.batteryTitle(battery.capacity, battery.charging)}
            aria-label={t.preview.batteryAria(battery.capacity, battery.charging)}
          >
            {React.createElement(resolveBatteryIcon(BATTERY_ICONS, battery.capacity, battery.charging), {size: 15})}
            <span>{battery.capacity}%</span>
          </div>
        )}
        <div className="window-actions">
          <button
            type="button"
            className="small-button"
            style={{padding: '4px 9px', fontSize: 11, fontWeight: 600, marginRight: 4}}
            title={t.controls.switchLang}
            onClick={toggleLang}
          >
            {lang === 'en' ? '🇺🇸 EN' : '🇪🇸 ES'}
          </button>
          <RecordButton recording={recording} disabled={!isDisplaying && !recording} onClick={toggleRecording} t={t}/>
          <IconButton icon={Maximize2} label={t.controls.fullscreen} onClick={() => { if (bridge) native('fullscreen'); else if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {}); }} />
          <IconButton icon={Minus} label={t.controls.minimize} onClick={() => native('minimize')}/>
          <IconButton icon={Maximize2} label={t.controls.maximize} onClick={() => native('maximize')}/>
          <IconButton icon={X} label={t.controls.quit} className="close-button" onClick={() => native('close')}/>
        </div>
      </header>
      <div className="workspace-content">
        <section className="viewer" aria-label={t.studio.viewerAria}><div className="viewer-heading"><span className={`connection-pill ${connected ? 'connected' : ''}`}><i/>{connected ? t.status.usbConnected : statusLabel}</span><span className="stream-info">{live ? <>{videoMode && <span className={`engine-badge ${videoMode}`} title={videoMode === 'software' ? t.studio.softwareDecodeTitle : t.studio.hevcDecodeTitle}>{videoMode === 'software' ? t.studio.compatibleBadge(t.studio.qualityNames[videoQuality] || 'Soft') : 'HEVC'}</span>}<FrameRate frames={frames}/> · {dimensions.width} × {dimensions.height}</> : cameraLive ? <><span className="engine-badge detail" title={t.studio.cameraBadgeTitle}>{t.studio.cameraBadge}</span> · {t.studio.dvtLive}</> : t.studio.liveView}</span></div>{preview}<div className="viewer-hints"><span><Mouse size={13}/>{t.studio.hintClickDrag}</span><span><Scan size={13}/>{t.studio.hintScroll}</span><span><Keyboard size={13}/>{keyboard ? t.studio.hintKeyboardActive : t.studio.hintClickToType}</span></div></section>
        <aside className="inspector" aria-label={currentSection[2]}><div className="inspector-heading"><span className="section-symbol"><SectionIcon size={20}/></span><div><h1>{currentSection[2]}</h1><p>{t.sections[tab][1]}</p></div></div>
          <InspectorContent
            tab={tab} state={state} connected={connected} live={live} bridge={bridge} native={native} switchMode={switchMode} disconnectSession={disconnectSession}
            videoMode={videoMode} videoQuality={videoQuality} setVideoQuality={setVideoQuality} forceSoftware={forceSoftware} setForceSoftware={setForceSoftware}
            mediaPaused={mediaPaused} mediaPauseReason={mediaPauseReason} mediaBusy={mediaBusy} toggleMediaPause={toggleMediaPause} iosStyle={iosStyle} changeIosStyle={changeIosStyle}
            accessibility={accessibility} accessibilityBusy={accessibilityBusy} toggleAccessibility={toggleAccessibility}
            loadingApps={loadingApps} loadDeviceApps={loadDeviceApps} appSwitcher={appSwitcher} controlCenterSwipe={controlCenterSwipe} notificationsSwipe={notificationsSwipe} setDisplayMode={setDisplayMode} wakePhone={wakePhone} rotatePhone={rotatePhone} rotating={rotating}
            button={button} capture={capture} audioEnabled={audioEnabled} audioStatus={audioStatus} volume={volume} setVolume={setVolume} toggleAudio={toggleAudio} phoneAudioButton={phoneAudioButton}
            platformLabel={platformLabel} clipboardBusy={clipboardBusy} shareClipboard={shareClipboard} text={text} setText={setText} sendText={sendText}
            setTheme={setTheme} sensitivity={sensitivity} setSensitivity={setSensitivity} pointer={pointer} updatePointer={updatePointer} exportDiagnostics={exportDiagnostics}
            lang={lang} setLang={setLang} t={t}
          />
        </aside>
      </div>
      <footer className="statusbar"><span className={state.phase === 'error' ? 'error-text' : ''}><i className={connected ? 'connected' : ''}/>{connected ? t.status.connectedViaUsb(state.device?.name || 'iPhone') : translateBackendText(state.message, lang)}</span><span>{audioEnabled ? <Volume2 size={12}/> : <VolumeX size={12}/>}{t.status.pcAudio(audioEnabled)}</span></footer>
    </div>
    {state.phase === 'seleccion' && <div className="modal-backdrop"><section className="device-picker"><h2>{t.studio.selectIphone}</h2>{state.devices.map(device => <button key={device.udid} onClick={() => native('device', device.udid)}><Smartphone size={18}/>{device.name}<ChevronRight size={15}/></button>)}</section></div>}
    {showApps && <AppsModal apps={deviceApps} loadingApps={loadingApps} launchingApp={launchingApp} onLaunch={launchDeviceApp} onRefresh={loadDeviceApps} onClose={() => setShowApps(false)} t={t}/>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}
