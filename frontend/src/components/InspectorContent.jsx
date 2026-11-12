import React from 'react';
import {Bell, Camera, Check, ChevronRight, CircleHelp, Clipboard, Download, ExternalLink, Home, Layers, LockKeyhole, LogOut, Moon, Mouse, RefreshCw, RotateCw, Send, SlidersHorizontal, Smartphone, Sun, Volume1, Volume2, VolumeX} from 'lucide-react';
import {Toggle} from './Controls.jsx';
import {STRINGS, translateBackendText} from '../i18n.js';

export function InspectorContent({
  tab, state, connected, live, bridge, native, switchMode, disconnectSession,
  videoMode, videoQuality, setVideoQuality, forceSoftware, setForceSoftware,
  mediaPaused, mediaPauseReason, mediaBusy, toggleMediaPause, iosStyle, changeIosStyle,
  accessibility = {}, accessibilityBusy = false, toggleAccessibility,
  loadingApps, loadDeviceApps, appSwitcher, controlCenterSwipe, notificationsSwipe, setDisplayMode, wakePhone, rotatePhone, rotating,
  button, capture, audioEnabled, audioStatus, volume, setVolume, toggleAudio, phoneAudioButton,
  platformLabel, clipboardBusy, shareClipboard, text, setText, sendText,
  setTheme, sensitivity, setSensitivity, pointer, updatePointer, exportDiagnostics,
  lang = 'en', setLang, t = STRINGS.en,
}) {
  const s = t.inspector;
  const qNames = t.studio.qualityNames;
  return (
    <div className="inspector-content" key={tab}>
      {tab === 'phone' && <>
        <section className="settings-group"><h2>{s.deviceGroup}</h2><div className="settings-box"><div className="info-row"><span>{s.name}</span><strong>{state.device?.name || 'iPhone'}</strong></div><div className="info-row"><span>{s.connection}</span><strong>{connected ? 'USB' : s.notConnected}</strong></div>{state.device?.version && <div className="info-row"><span>{s.version}</span><strong>iOS {state.device.version}</strong></div>}<button className="row-button" disabled={!connected} onClick={appSwitcher}><Layers size={15}/>{s.openAppSwitcher}<ChevronRight size={14}/></button><button className="row-button" disabled={!connected} onClick={controlCenterSwipe}><SlidersHorizontal size={15}/>{s.openControlCenter}<ChevronRight size={14}/></button><button className="row-button" disabled={!connected} onClick={notificationsSwipe}><Bell size={15}/>{s.openNotifications}<ChevronRight size={14}/></button><button className="row-button" disabled={!connected || loadingApps} onClick={loadDeviceApps}><Smartphone size={15}/>{loadingApps ? s.loadingApps : s.viewInstalledApps}<ChevronRight size={14}/></button><button className="row-button" onClick={() => native('retry')}><RefreshCw size={15}/>{s.reconnect}<ChevronRight size={14}/></button></div></section>
        <section className="settings-group"><h2>{s.videoGroup}</h2>
          <div className="settings-box">
            <Toggle label={s.forceCompatibleVideo} detail={videoMode === 'software' ? s.softwareActive : videoMode === 'native' ? s.nativeActive : s.detectOnConnect} value={forceSoftware} onClick={() => setForceSoftware(value => !value)}/>
            <div className="stacked-row"><span>{s.compatibleQuality}</span>
              <div className="segmented" role="group" aria-label={s.compatibleQuality}>
                {[['economy', qNames.economy], ['balanced', qNames.balanced], ['detail', qNames.detail]].map(([value, label]) => <button key={value} className={videoQuality === value ? 'selected' : ''} aria-pressed={videoQuality === value} onClick={() => setVideoQuality(value)}>{label}</button>)}
              </div>
            </div>
          </div>
          <p className="group-description">{s.qualityDesc[videoQuality]} {s.videoGroupNote}</p>
          {videoMode === 'software' && videoQuality === 'detail' && <div className="note" style={{marginTop: 8}}><CircleHelp size={13}/><span>{s.cpuWarning}</span></div>}
        </section>
        <section className="settings-group"><h2>{s.iosPerfGroup}</h2>
          <div className="settings-box">
            <Toggle
              label={s.reduceMotion}
              detail={s.reduceMotionDetail}
              value={Boolean(accessibility.reduce_motion)}
              disabled={!connected || accessibilityBusy}
              onClick={() => toggleAccessibility?.('reduce_motion', !accessibility.reduce_motion)}
            />
            <Toggle
              label={s.reduceTransparency}
              detail={s.reduceTransparencyDetail}
              value={Boolean(accessibility.reduce_transparency)}
              disabled={!connected || accessibilityBusy}
              onClick={() => toggleAccessibility?.('reduce_transparency', !accessibility.reduce_transparency)}
            />
            <Toggle
              label={s.increaseContrast}
              detail={s.increaseContrastDetail}
              value={Boolean(accessibility.increase_contrast)}
              disabled={!connected || accessibilityBusy}
              onClick={() => toggleAccessibility?.('increase_contrast', !accessibility.increase_contrast)}
            />
          </div>
          <p className="group-description">{s.iosPerfNote}</p>
        </section>
        <section className="settings-group"><h2>{s.camMicGroup}</h2>
          <div className="settings-box">
            <Toggle
              label={s.releaseCamMic}
              detail={mediaPaused ? (mediaPauseReason === 'auto_sensor' ? s.camMicAutoPaused : s.camMicManualPaused) : s.camMicAutoDetail}
              value={mediaPaused}
              disabled={!connected || mediaBusy}
              onClick={() => toggleMediaPause(!mediaPaused)}
            />
            {mediaPaused && <button className="row-button" disabled={!connected || mediaBusy} onClick={() => toggleMediaPause(false, {exitApp: true})}>
              <Home size={15}/>{s.exitCamAndResume}<ChevronRight size={14}/>
            </button>}
          </div>
          <p className="group-description">{s.camMicNote}</p>
        </section>
        <section className="settings-group"><h2>{s.physicalDisplayGroup}</h2>
          <div className="settings-box">
            <div className="stacked-row">
              <span>{s.modeLabel}</span>
              <div className="segmented" role="group" aria-label={s.physicalDisplayGroup}>
                <button className={state.displayMode !== 'aod' ? 'selected' : ''} aria-pressed={state.displayMode !== 'aod'} onClick={() => setDisplayMode('dual')}>{s.dualScreen}</button>
                <button className={state.displayMode === 'aod' ? 'selected' : ''} aria-pressed={state.displayMode === 'aod'} onClick={() => setDisplayMode('aod')}>{s.aodStandby}</button>
              </div>
            </div>
            <div className="stacked-row">
              <span>{s.iosAppearance}</span>
              <div className="segmented" role="group" aria-label={s.iosAppearance}>
                <button className={iosStyle === 'light' ? 'selected' : ''} disabled={!connected} aria-pressed={iosStyle === 'light'} onClick={() => changeIosStyle('light')}>{s.light}</button>
                <button className={iosStyle === 'dark' ? 'selected' : ''} disabled={!connected} aria-pressed={iosStyle === 'dark'} onClick={() => changeIosStyle('dark')}>{s.dark}</button>
              </div>
            </div>
            <button className="row-button" disabled={!connected} onClick={() => button('lock')}>
              <Moon size={15}/>{s.requestSleep}<ChevronRight size={14}/>
            </button>
            <button className="row-button" disabled={!connected} onClick={wakePhone}>
              <Sun size={15}/>{s.wakeDisplay}<ChevronRight size={14}/>
            </button>
          </div>
          <p className="group-description">
            {state.displayMode === 'aod' ? s.aodDesc : s.dualDesc}
          </p>
        </section>
        <section className="settings-group"><h2>{s.windowGroup}</h2><div className="settings-box">{bridge && <Toggle label={s.alwaysOnTop} detail={s.alwaysOnTopDetail} value={state.alwaysOnTop} onClick={() => native('pin', !state.alwaysOnTop)}/>}<button className="row-button" onClick={() => switchMode ? switchMode('phone') : native('mode', 'phone')}><ExternalLink size={15}/>{s.switchToPhoneView}<ChevronRight size={14}/></button></div></section>
        <section className="settings-group"><h2>{s.sessionGroup}</h2><div className="settings-box"><button className="row-button" disabled={!connected} onClick={() => disconnectSession ? disconnectSession() : native('disconnect')}><LogOut size={16}/>{s.safeDisconnect}<ChevronRight size={14}/></button></div><p className="group-description">{s.sessionNote}</p></section>
        <section className="settings-group"><h2>{s.orientationGroup}</h2><div className="settings-box"><button className="row-button" disabled={!connected || rotating} onClick={rotatePhone}><RotateCw size={16}/>{s.rotate90}<ChevronRight size={14}/></button></div><p className="group-description">{s.orientationNote}</p></section>
        <section className="settings-group"><h2>{s.actionsGroup}</h2><div className="action-grid">{[[Home, s.homeAction, 'home'], [LockKeyhole, s.lockAction, 'lock'], [Camera, s.captureAction, 'capture']].map(([Icon, label, command]) => <button key={command} disabled={command === 'capture' ? !live : !connected} onClick={() => command === 'capture' ? capture() : button(command)}><Icon size={20}/><span>{label}</span></button>)}</div><p className="group-description">{s.actionsNote}</p></section>
        <div className="note"><Mouse size={16}/><p>{s.mouseHint}</p></div>
      </>}
      {tab === 'audio' && <>
        <section className="settings-group"><h2>{s.thisPcGroup}</h2><div className="settings-box"><Toggle label={s.playAudioOnPc} detail={translateBackendText(audioStatus, lang)} value={audioEnabled} onClick={toggleAudio}/><label className="slider-row"><span>{s.volumeLabel} <output>{Math.round(volume * 100)} %</output></span><div><Volume1 size={15}/><input aria-label={s.pcVolumeAria} type="range" min="0" max="1" step="0.05" value={volume} disabled={!audioEnabled} onChange={event => setVolume(Number(event.target.value))}/><Volume2 size={16}/></div></label></div><p className="group-description">{s.audioOutputNote(platformLabel)}</p></section>
        <section className="settings-group"><h2>{s.iphoneAudioGroup}</h2><div className="settings-box"><div className="volume-buttons"><button disabled={!connected} aria-label={s.volDownAria} onClick={() => phoneAudioButton('volume-down')}><Volume1 size={18}/>{s.volDown}</button><button disabled={!connected} aria-label={s.volUpAria} onClick={() => phoneAudioButton('volume-up')}><Volume2 size={18}/>{s.volUp}</button></div><button className="row-button" disabled={!connected} onClick={() => phoneAudioButton('mute')}><VolumeX size={16}/>{s.toggleMute}<ChevronRight size={14}/></button></div><p className="group-description">{s.iphoneAudioNote}</p></section>
        <div className="note"><Volume2 size={17}/><p>{s.audioTip}</p></div>
      </>}
      {tab === 'clipboard' && <>
        <section className="settings-group"><h2>{s.clipboardShortcutsGroup}</h2><div className="settings-box"><div className="info-row"><span>{s.selectAllIos}</span><kbd>Ctrl + A</kbd></div><div className="info-row"><span>{s.copyToPc}</span><kbd>Ctrl + C</kbd></div><div className="info-row"><span>{s.cutInIos}</span><kbd>Ctrl + X</kbd></div><div className="info-row"><span>{s.pasteToIphone}</span><kbd>Ctrl + V</kbd></div><div className="info-row"><span>{s.undoInIos}</span><kbd>Ctrl + Z</kbd></div></div><p className="group-description">{s.clipboardShortcutsNote}</p>{clipboardBusy && <p className="group-description" role="status">{s.clipboardBusyStatus}</p>}</section>
        <details className="settings-group"><summary>{s.manualTransferSummary}</summary>
        <section className="settings-group"><h2>{s.shareClipboardGroup}</h2><div className="transfer-stack"><button disabled={!bridge || !connected || clipboardBusy} onClick={() => shareClipboard('toPhone')}><span className="transfer-icon"><Send size={20}/></span><span><strong>PC → iPhone</strong><small>{s.pcToIphoneSub}</small></span><ChevronRight size={16}/></button><button disabled={!bridge || !connected || clipboardBusy} onClick={() => shareClipboard('toPC')}><span className="transfer-icon"><Download size={20}/></span><span><strong>iPhone → PC</strong><small>{s.iphoneToPcSub}</small></span><ChevronRight size={16}/></button></div><p className="group-description">{clipboardBusy ? s.transferringNote : s.transferReadyNote}</p></section>
        <section className="settings-group"><h2>{s.sendTextGroup}</h2><form className="text-form" onSubmit={sendText}><textarea value={text} onChange={event => setText(event.target.value)} placeholder={s.sendTextPlaceholder} aria-label={s.sendTextAria}/><button className="primary-button" disabled={!connected || !text.trim()}><Send size={15}/>{s.pasteOnIphoneBtn}</button></form><p className="group-description">{s.sendTextNote}</p></section>
        </details>
        <div className="note"><Clipboard size={16}/><p>{s.clipboardPrivacyNote}</p></div>
      </>}
      {tab === 'appearance' && <>
        <section className="settings-group"><h2>{s.languageGroup}</h2>
          <div className="settings-box">
            <div className="stacked-row">
              <span>Language / Idioma</span>
              <div className="segmented" role="group" aria-label={s.languageGroup}>
                <button className={lang === 'en' ? 'selected' : ''} aria-pressed={lang === 'en'} onClick={() => setLang?.('en')}>English (EN)</button>
                <button className={lang === 'es' ? 'selected' : ''} aria-pressed={lang === 'es'} onClick={() => setLang?.('es')}>Español (ES)</button>
              </div>
            </div>
          </div>
        </section>
        <section className="settings-group"><h2>{s.themeGroup}</h2><div className="theme-grid" role="group" aria-label={s.themeGroup}>{s.themes.map(([id, label]) => <button key={id} aria-pressed={state.theme === id} onClick={() => setTheme(id)} className={state.theme === id ? 'chosen' : ''}><span className={`theme-preview theme-${id}`}><i/><b/><em/>{state.theme === id && <span><Check size={12}/></span>}</span><strong>{label}</strong></button>)}</div><div className="settings-box"><Toggle label={s.useSystemTheme} value={state.theme === 'sistema'} onClick={() => setTheme(state.theme === 'sistema' ? 'claro' : 'sistema')}/></div></section>
        <section className="settings-group"><h2>{s.floatingPhoneGroup}</h2><div className="settings-box"><div className="stacked-row"><span>{s.sizeLabel}</span><div className="segmented" role="group" aria-label={s.sizeLabel}>{s.sizes.map(([size, label]) => <button key={size} aria-pressed={state.size === size} className={state.size === size ? 'selected' : ''} onClick={() => native('size', size)}>{label}</button>)}</div></div><Toggle label={s.alwaysOnTop} value={state.alwaysOnTop} onClick={() => native('pin', !state.alwaysOnTop)} disabled={!bridge}/></div></section>
        <section className="settings-group"><h2>{s.mouseGroup}</h2><div className="settings-box"><label className="slider-row"><span>{s.wheelSensitivity} <output>{sensitivity.toFixed(1)}×</output></span><div><Mouse size={15}/><input aria-label={s.wheelSensitivity} type="range" min="0.5" max="2" step="0.1" value={sensitivity} onChange={event => {const value = Number(event.target.value); setSensitivity(value); localStorage.setItem('sensibilidad',value);}}/></div></label><div className="stacked-row"><span>{s.pointerInside}</span><div className="segmented" role="group" aria-label={s.pointerInside}>{s.pointerShapes.map(([id, label]) => <button key={id} aria-pressed={pointer.shape === id} className={pointer.shape === id ? 'selected' : ''} onClick={() => updatePointer('shape', id)}>{label}</button>)}</div></div><label className="slider-row"><span>{s.pointerSize} <output>{pointer.size} %</output></span><div><span className="pointer-swatch" style={{background: pointer.color}}/><input aria-label={s.pointerSize} type="range" min="50" max="200" step="10" value={pointer.size} onChange={event => updatePointer('size', Number(event.target.value))}/></div></label><label className="color-row"><span>{s.pointerColor}</span><input aria-label={s.pointerColor} type="color" value={pointer.color} onChange={event => updatePointer('color', event.target.value)}/></label></div><p className="group-description">{s.pointerNote}</p></section>
      </>}
      {tab === 'help' && <>
        <section className="settings-group"><h2>{s.updatesGroup}</h2><div className="settings-box"><div className="info-row"><span>{s.installedVersion}</span><strong>{state.version || '—'}</strong></div><button className="row-button" disabled={['comprobando','descargando'].includes(state.update?.phase)} onClick={() => native('updatesCheck')}><RefreshCw size={15}/>{s.checkUpdates}<ChevronRight size={14}/></button>{state.update?.phase === 'disponible' && <button className="row-button" onClick={() => native('updatesDownload')}><Download size={15}/>{s.downloadVersion(state.update.version)}<ChevronRight size={14}/></button>}{state.update?.phase === 'lista' && <button className="row-button" onClick={() => native('updatesInstall')}><RefreshCw size={15}/>{s.restartAndUpdate}<ChevronRight size={14}/></button>}</div><p className="group-description">{translateBackendText(state.update?.message || 'Consulta automáticamente las versiones publicadas en GitHub.', lang)}{state.update?.phase === 'descargando' ? ` ${state.update.progress || 0} %` : ''}</p></section>
        <section className="settings-group"><h2>{s.connectStepsGroup}</h2><ol className="steps"><li><span>1</span><p>{s.step1}</p></li><li><span>2</span><p>{s.step2}</p></li><li><span>3</span><p>{s.step3}</p></li></ol></section>
        <section className="settings-group"><h2>{s.controlsHelpGroup}</h2><div className="settings-box">{s.controlsHelpRows.map(([a, b]) => <div className="info-row" key={a}><span>{a}</span><strong>{b}</strong></div>)}</div></section>
        <section className="settings-group"><h2>{s.shortcutsHelpGroup}</h2><div className="settings-box">{s.shortcutsHelpRows.map(([a, b]) => <div className="info-row" key={a}><span>{a}</span><kbd>{b}</kbd></div>)}</div></section>
        <section className="settings-group"><h2>{s.diagnosticsGroup}</h2><div className="settings-box"><button className="row-button" onClick={exportDiagnostics}><Download size={15}/>{s.exportDiagnostics}<ChevronRight size={14}/></button>{bridge && <button className="row-button" onClick={() => native('logs')}><ExternalLink size={15}/>{s.openLogs}<ChevronRight size={14}/></button>}</div><p className="group-description">{s.diagnosticsNote}</p></section>
      </>}
    </div>
  );
}
