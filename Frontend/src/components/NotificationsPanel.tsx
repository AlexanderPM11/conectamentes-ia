import { useState, useEffect } from 'react';
import { api } from '../shared/api/client';
import { formatRelative } from '../utils/date';
import { Icon, EmptyState } from './index'; // assuming these are exported from index

export function NotificationsPanel({ items, onClose, onOpen, onMarkAll }: any) {
  const permission = 'Notification' in window ? window.Notification.permission : 'unsupported';
  const [devicePermission, setDevicePermission] = useState(permission);
  const [pushActive, setPushActive] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(permission === 'granted');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [requestingPermission, setRequestingPermission] = useState(false);
  
  useEffect(() => {
    let active = true;
    if (permission !== 'granted' || !('serviceWorker' in navigator) || !('PushManager' in window)) { setCheckingSubscription(false); return; }
    navigator.serviceWorker.ready.then(registration => registration.pushManager.getSubscription()).then(subscription => { if (active) setPushActive(Boolean(subscription)); }).catch(() => undefined).finally(() => { if (active) setCheckingSubscription(false); });
    return () => { active = false; };
  }, []);
  
  async function enableDeviceAlerts() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setDevicePermission('unsupported');
      setPermissionMessage('Este dispositivo no admite avisos con la aplicación cerrada. En iPhone debes instalar la PWA en la pantalla de inicio y usar iOS 16.4 o superior.');
      return;
    }
    setRequestingPermission(true);
    setPermissionMessage('Estamos solicitando permiso al dispositivo…');
    try {
      const nextPermission = await window.Notification.requestPermission();
      setDevicePermission(nextPermission);
      if (nextPermission === 'granted') {
        const { subscribeDevicePush } = await import('../utils/push'); // Move push logic to a utility
        await subscribeDevicePush();
        setPushActive(true);
        setPermissionMessage('Listo. Este dispositivo recibirá solicitudes y mensajes aunque la aplicación esté cerrada.');
      } else {
        setPushActive(false);
        setPermissionMessage(nextPermission === 'denied'
          ? 'Los avisos están bloqueados. Puedes activarlos desde los permisos del navegador.'
          : 'No se activaron los avisos. Puedes intentarlo nuevamente cuando quieras.');
      }
    } catch (error) {
      setPushActive(false);
      const raw = error instanceof Error ? error.message : '';
      if (/push service error/i.test(raw)) {
        setPermissionMessage('El navegador no pudo conectar con el servicio de avisos del sistema. Si usas Brave, activa «Servicios de Google para mensajería push» en brave://settings/privacy y reinicia el navegador; si usas bloqueadores de red o modo incógnito, pruébalo en una pestaña normal.');
      } else if (/applicationServerKey/i.test(raw)) {
        setPermissionMessage('La clave de avisos del servidor no es compatible o no está configurada.');
      } else if (raw && !/failed|error|object|DOMException/i.test(raw)) {
        setPermissionMessage(raw);
      } else {
        setPermissionMessage('No pudimos activar los avisos en este momento. Inténtalo nuevamente.');
      }
    } finally {
      setRequestingPermission(false);
    }
  }
  
  const supportsPush = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const status = !supportsPush || devicePermission === 'unsupported' ? 'unsupported' : devicePermission === 'denied' ? 'blocked' : devicePermission === 'granted' && pushActive ? 'active' : 'idle';
  
  return (
    <div className="notifications-backdrop" onClick={onClose}>
      <aside className="notifications-panel" onClick={event => event.stopPropagation()}>
        <div className="notifications-head">
          <div><p className="eyebrow">ACTIVIDAD</p><h2>Notificaciones</h2></div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        {status === 'idle' && (
          <button className="device-alerts" onClick={enableDeviceAlerts} disabled={requestingPermission || checkingSubscription}>
            <Icon name="bell" />
            <span>
              <strong>{requestingPermission ? 'Activando avisos…' : checkingSubscription ? 'Comprobando dispositivo…' : devicePermission === 'granted' ? 'Completar activación' : 'Activar avisos del dispositivo'}</strong>
              <small>Recibe alertas aunque la PWA esté cerrada.</small>
            </span>
            <b aria-hidden="true">›</b>
          </button>
        )}
        
        {status === 'active' && (
          <div className="device-alerts device-alerts-status active" role="status">
            <span className="device-status-icon">✓</span>
            <span>
              <strong>Avisos activos en este dispositivo</strong>
              <small>Recibirás solicitudes, mensajes y comentarios incluso con la aplicación cerrada.</small>
            </span>
          </div>
        )}
        
        {status === 'blocked' && (
          <div className="device-alerts device-alerts-status blocked" role="alert">
            <span className="device-status-icon">!</span>
            <span>
              <strong>Avisos bloqueados</strong>
              <small>Actívalos desde los permisos del navegador o del sistema.</small>
            </span>
          </div>
        )}
        
        {status === 'unsupported' && (
          <div className="device-alerts device-alerts-status unsupported" role="status">
            <span className="device-status-icon">i</span>
            <span>
              <strong>Avisos no disponibles</strong>
              <small>En iPhone instala la PWA en la pantalla de inicio y usa iOS 16.4 o superior.</small>
            </span>
          </div>
        )}
        
        {permissionMessage && (
          <p className={`permission-feedback ${status}`} role={status === 'blocked' ? 'alert' : 'status'}>
            {permissionMessage}
          </p>
        )}
        
        {status === 'blocked' && (
          <button className="permission-retry" onClick={enableDeviceAlerts}>Volver a comprobar</button>
        )}
        
        <div className="notification-list">
          {items.length ? items.map((item: any) => (
            <button key={item.id} className={item.isRead ? 'notification-item' : 'notification-item unread'} onClick={() => onOpen(item)}>
              <span className="notification-icon">
                <Icon name={item.type === 'message' || item.type === 'comment' ? 'message' : item.type === 'session' ? 'calendar' : 'match'} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
                <time>{formatRelative(item.createdAt)}</time>
              </span>
              {!item.isRead && <i />}
            </button>
          )) : <EmptyState title="Todo al día" text="Aquí verás solicitudes, mensajes, sesiones y comentarios." badge="network" />}
        </div>
        
        {items.some((item: any) => !item.isRead) && (
          <button className="mark-all" onClick={onMarkAll}>Marcar todo como leído</button>
        )}
      </aside>
    </div>
  );
}
