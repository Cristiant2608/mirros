import React, {useEffect, useState} from 'react';
import {Check, Copy, ExternalLink, LoaderCircle, RefreshCw, X} from 'lucide-react';
import {IconButton} from './Controls.jsx';

export function AppsModal({apps, loadingApps, launchingApp, onLaunch, onRefresh, onClose}) {
  const [filter, setFilter] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copyBundleId(event, bundleId) {
    event.stopPropagation();
    try {
      await navigator.clipboard?.writeText(bundleId);
      setCopiedId(bundleId);
      setTimeout(() => setCopiedId(prev => prev === bundleId ? null : prev), 1500);
    } catch {}
  }

  const query = filter.trim().toLowerCase();
  const filtered = apps.filter(app => !query || app.name.toLowerCase().includes(query) || app.bundle_id.toLowerCase().includes(query));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="device-picker apps-modal" role="dialog" aria-modal="true" aria-label="Aplicaciones instaladas" onClick={event => event.stopPropagation()}>
        <div className="apps-header">
          <h2>Aplicaciones ({apps.length})</h2>
          <div className="apps-header-actions">
            {onRefresh && <IconButton icon={RefreshCw} label="Recargar aplicaciones" disabled={loadingApps} onClick={onRefresh}/>}
            <IconButton icon={X} label="Cerrar" onClick={onClose}/>
          </div>
        </div>
        <input
          type="search"
          className="apps-search"
          placeholder="Buscar por nombre o identificador…"
          aria-label="Buscar aplicación"
          value={filter}
          onChange={event => setFilter(event.target.value)}
          autoFocus
        />
        <div className="apps-list">
          {filtered.length === 0 ? (
            <div className="apps-empty">No se encontraron aplicaciones</div>
          ) : (
            filtered.map(app => {
              const busy = launchingApp === app.bundle_id;
              const copied = copiedId === app.bundle_id;
              return (
                <div key={app.bundle_id} className="app-row">
                  <button
                    type="button"
                    className="app-item"
                    disabled={Boolean(launchingApp)}
                    onClick={() => onLaunch(app)}
                    title={`Abrir ${app.name} en el iPhone`}
                  >
                    <div className="app-meta">
                      <strong>{app.name}</strong>
                      <small>{app.bundle_id}</small>
                    </div>
                    {app.version && <span className="app-version">v{app.version}</span>}
                    {busy ? <LoaderCircle size={14} className="spin"/> : <ExternalLink size={14}/>}
                  </button>
                  <button
                    type="button"
                    className="app-copy"
                    title={copied ? 'Identificador copiado' : `Copiar ${app.bundle_id}`}
                    aria-label={`Copiar identificador de ${app.name}`}
                    onClick={event => copyBundleId(event, app.bundle_id)}
                  >
                    {copied ? <Check size={13}/> : <Copy size={13}/>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
