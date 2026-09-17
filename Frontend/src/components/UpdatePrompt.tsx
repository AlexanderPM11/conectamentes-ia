import { useState, useRef, useEffect } from 'react';
import { IsoBadge } from './index'; // assuming IsoBadge is in index

const PWA_VERSION = new URL(import.meta.url).pathname.split('/').pop() ?? 'app';
const APPLIED_WORKER_KEY = 'conectamentes_applied_worker';

export function usePwaUpdate() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const updateRequested = useRef(false);
  const reloadTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null; let interval = 0; let reloading = false;
    const reloadOnce = () => { if (reloading) return; reloading = true; if (reloadTimer.current) window.clearTimeout(reloadTimer.current); location.reload(); };
    const revealUpdate = () => {
      const worker = registration?.waiting;
      if (!worker || worker.state !== 'installed' || updateRequested.current) return;
      if (localStorage.getItem(APPLIED_WORKER_KEY) === worker.scriptURL) { worker.postMessage({ type: 'SKIP_WAITING' }); return; }
      setWaitingWorker(worker);
    };
    const updateFound = () => { const worker = registration?.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) revealUpdate(); }); };
    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
    navigator.serviceWorker.register(`/sw.js?v=${PWA_VERSION}`, { updateViaCache: 'none' }).then(current => { registration = current; revealUpdate(); current.addEventListener('updatefound', updateFound); current.update().then(revealUpdate).catch(() => undefined); interval = window.setInterval(() => current.update(), 5 * 60 * 1000); }).catch(() => undefined);
    return () => { if (interval) window.clearInterval(interval); if (reloadTimer.current) window.clearTimeout(reloadTimer.current); registration?.removeEventListener('updatefound', updateFound); navigator.serviceWorker.removeEventListener('controllerchange', reloadOnce); };
  }, []);
  function applyUpdate() {
    if (!waitingWorker || updating) return;
    updateRequested.current = true;
    setUpdating(true);
    const worker = waitingWorker;
    localStorage.setItem(APPLIED_WORKER_KEY, worker.scriptURL);
    setWaitingWorker(null);
    worker.postMessage({ type: 'SKIP_WAITING' });
    reloadTimer.current = window.setTimeout(() => location.reload(), 4000);
  }
  return { available: Boolean(waitingWorker), updating, applyUpdate };
}

export function UpdatePrompt({ available, updating, applyUpdate }: { available: boolean; updating: boolean; applyUpdate: () => void }) {
  if (!available) return null;
  return <aside className="update-prompt" role="status" aria-live="polite"><IsoBadge kind="network" /><div><span>NUEVA VERSIÓN</span><strong>Hay mejoras listas</strong><p>Actualiza para traer los últimos cambios.</p></div><button className="button button-light small" onClick={applyUpdate} disabled={updating}>{updating ? 'Actualizando…' : 'Actualizar ahora'}</button></aside>;
}
