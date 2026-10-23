import React from 'react';
import {Camera, Check, ChevronRight, CircleHelp, Clipboard, Download, ExternalLink, Home, Layers, LockKeyhole, LogOut, Moon, Mouse, RefreshCw, RotateCw, Send, Smartphone, Sun, Volume1, Volume2, VolumeX} from 'lucide-react';
import {Toggle} from './Controls.jsx';

const themes = [['claro', 'Claro'], ['oscuro', 'Oscuro'], ['lavanda', 'Lavanda'], ['oceano', 'Océano']];

export function InspectorContent({
  tab, state, connected, live, bridge, native,
  videoMode, videoQuality, setVideoQuality, forceSoftware, setForceSoftware,
  mediaPaused, mediaPauseReason, mediaBusy, toggleMediaPause, iosStyle, changeIosStyle,
  loadingApps, loadDeviceApps, appSwitcher, setDisplayMode, wakePhone, rotatePhone, rotating,
  button, capture, audioEnabled, audioStatus, volume, setVolume, toggleAudio, phoneAudioButton,
  platformLabel, clipboardBusy, shareClipboard, text, setText, sendText,
  setTheme, sensitivity, setSensitivity, pointer, updatePointer, exportDiagnostics,
}) {
  return (
    <div className="inspector-content" key={tab}>
      {tab === 'phone' && <>
        <section className="settings-group"><h2>Dispositivo</h2><div className="settings-box"><div className="info-row"><span>Nombre</span><strong>{state.device?.name || 'iPhone'}</strong></div><div className="info-row"><span>Conexión</span><strong>{connected ? 'USB' : 'No conectado'}</strong></div>{state.device?.version && <div className="info-row"><span>Versión</span><strong>iOS {state.device.version}</strong></div>}<button className="row-button" disabled={!connected} onClick={appSwitcher}><Layers size={15}/>Abrir selector de apps (Multitarea)<ChevronRight size={14}/></button><button className="row-button" disabled={!connected || loadingApps} onClick={loadDeviceApps}><Smartphone size={15}/>{loadingApps ? 'Cargando aplicaciones…' : 'Ver aplicaciones instaladas'}<ChevronRight size={14}/></button><button className="row-button" onClick={() => native('retry')}><RefreshCw size={15}/>Reconectar<ChevronRight size={14}/></button></div></section>
        <section className="settings-group"><h2>Video</h2>
          <div className="settings-box">
            <Toggle label="Forzar video compatible" detail={videoMode === 'software' ? 'Decodificación compatible activa' : videoMode === 'native' ? 'Decodificación automática activa' : 'Detección al conectar'} value={forceSoftware} onClick={() => setForceSoftware(value => !value)}/>
            <div className="stacked-row"><span>Calidad del video compatible</span>
              <div className="segmented" role="group" aria-label="Calidad del video compatible">
                {[['economy', 'Ahorro'], ['balanced', 'Equilibrado'], ['detail', 'Detalle']].map(([value, label]) => <button key={value} className={videoQuality === value ? 'selected' : ''} aria-pressed={videoQuality === value} onClick={() => setVideoQuality(value)}>{label}</button>)}
              </div>
            </div>
          </div>
          <p className="group-description">{{economy: 'Hasta 960 px y 20 FPS.', balanced: 'Hasta 1568 px y 30 FPS.', detail: 'Hasta 2160 px y 30 FPS.'}[videoQuality]} Mantiene la imagen completa. Se aplica al video compatible; el modo automático conserva HEVC cuando el navegador lo admite. Cambiar el perfil reinicia solo el video.</p>
          {videoMode === 'software' && videoQuality === 'detail' && <div className="note" style={{marginTop: 8}}><CircleHelp size={13}/><span>Si notas lentitud o sobrecarga de CPU, prueba el perfil <strong>Equilibrado</strong> o <strong>Ahorro</strong>.</span></div>}
        </section>
        <section className="settings-group"><h2>Cámara y micrófono del iPhone</h2>
          <div className="settings-box">
            <Toggle
              label="Liberar cámara y micrófono"
              detail={mediaPaused ? (mediaPauseReason === 'auto_sensor' ? 'Pausa automática · Cámara o micrófono en uso en iOS' : 'Captura en pausa · Sensores disponibles en iOS') : 'Se activa sola al abrir Cámara o Notas de Voz'}
              value={mediaPaused}
              disabled={!connected || mediaBusy}
              onClick={() => toggleMediaPause(!mediaPaused)}
            />
            {mediaPaused && <button className="row-button" disabled={!connected || mediaBusy} onClick={() => toggleMediaPause(false, {exitApp: true})}>
              <Home size={15}/>Salir de Cámara y reanudar pantalla<ChevronRight size={14}/>
            </button>}
          </div>
          <p className="group-description">iOS bloquea la cámara y el micrófono mientras transmite la pantalla (CoreDevice 9022) y oculta el visor de la cámara en la imagen enviada al PC. Mirros pausa la captura automáticamente al abrir Cámara o Notas de Voz en el iPhone y la reanuda al cerrarlas.</p>
        </section>
        <section className="settings-group"><h2>Modo de pantalla física</h2>
          <div className="settings-box">
            <div className="stacked-row">
              <span>Modo</span>
              <div className="segmented" role="group" aria-label="Modo de pantalla física">
                <button className={state.displayMode !== 'aod' ? 'selected' : ''} aria-pressed={state.displayMode !== 'aod'} onClick={() => setDisplayMode('dual')}>Pantalla Dual</button>
                <button className={state.displayMode === 'aod' ? 'selected' : ''} aria-pressed={state.displayMode === 'aod'} onClick={() => setDisplayMode('aod')}>Reposo experimental</button>
              </div>
            </div>
            <div className="stacked-row">
              <span>Aspecto nativo de iOS</span>
              <div className="segmented" role="group" aria-label="Aspecto nativo de iOS">
                <button className={iosStyle === 'light' ? 'selected' : ''} disabled={!connected} aria-pressed={iosStyle === 'light'} onClick={() => changeIosStyle('light')}>Claro</button>
                <button className={iosStyle === 'dark' ? 'selected' : ''} disabled={!connected} aria-pressed={iosStyle === 'dark'} onClick={() => changeIosStyle('dark')}>Oscuro</button>
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
              ? 'Bloquea el iPhone y detiene las renovaciones automáticas para evitar congelamientos. Pulsa «Despertar pantalla del iPhone» (o Ctrl + U) para volver a Pantalla Dual.'
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
        <section className="settings-group"><h2>Atajos sobre la pantalla</h2><div className="settings-box">{[['Inicio','Ctrl + H'],['Selector de apps / Multitarea','Ctrl + M'],['Bloquear / Reposo','Ctrl + L'],['Solicitar despertar','Ctrl + U'],['Guardar captura','Ctrl + P']].map(([a,b]) => <div className="info-row" key={a}><span>{a}</span><kbd>{b}</kbd></div>)}</div></section>
        <section className="settings-group"><h2>Diagnóstico</h2><div className="settings-box"><button className="row-button" onClick={exportDiagnostics}><Download size={15}/>Exportar diagnóstico privado<ChevronRight size={14}/></button>{bridge && <button className="row-button" onClick={() => native('logs')}><ExternalLink size={15}/>Abrir registro de conexión<ChevronRight size={14}/></button>}</div><p className="group-description">El informe exportado incluye versiones y disponibilidad USB sin UDID, nombre del teléfono ni contenido del portapapeles.</p></section>
      </>}
    </div>
  );
}
