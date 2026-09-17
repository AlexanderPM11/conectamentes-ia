import { api } from '../shared/api/client';

function urlBase64ToUint8Array(value: string) {
  const clean = value.trim();
  const padding = '='.repeat((4 - clean.length % 4) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function subscribeDevicePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este dispositivo no admite notificaciones con la aplicación cerrada.');
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await api('/api/push/public-key');
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys?.auth) throw new Error('El dispositivo no entregó una suscripción válida.');
  await api('/api/push/subscriptions', { method: 'POST', body: JSON.stringify({ endpoint: value.endpoint, keys: value.keys }) });
  return subscription;
}

export async function unsubscribeDevicePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  try { await api('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) }); } catch { /* El cierre de sesión debe continuar aunque el servidor no responda. */ }
  await subscription.unsubscribe();
}
