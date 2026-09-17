import { ChangeEvent, CSSProperties, FormEvent, Fragment, StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import './styles.css';

const API = import.meta.env.VITE_API_URL || '';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;
const CHAT_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.txt';
const DO_LOCALE = 'es-DO';
const DO_TIME_ZONE = 'America/Santo_Domingo';
const PWA_VERSION = new URL(import.meta.url).pathname.split('/').pop() ?? 'app';
const APPLIED_WORKER_KEY = 'conectamentes_applied_worker';
type Mode = 'welcome' | 'login' | 'register' | 'recover';
type Tab = 'inicio' | 'perfil' | 'solicitudes' | 'coincidencias' | 'mensajes' | 'ranking' | 'agenda' | 'seguridad' | 'panel' | 'admin';
type IconName = 'home' | 'profile' | 'request' | 'match' | 'message' | 'bell' | 'search' | 'calendar' | 'shield' | 'chart' | 'star' | 'more' | 'back';

const navItems: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'solicitudes', label: 'Solicitudes', icon: 'request' },
  { id: 'coincidencias', label: 'Conexiones', icon: 'match' },
  { id: 'mensajes', label: 'Mensajes', icon: 'message' },
  { id: 'ranking', label: 'Ranking', icon: 'star' },
  { id: 'perfil', label: 'Mi perfil', icon: 'profile' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  { id: 'seguridad', label: 'Seguridad', icon: 'shield' },
  { id: 'panel', label: 'Panel', icon: 'chart' },
  { id: 'admin', label: 'Administración', icon: 'shield' }
];

async function api(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('conectamente_token');
  const isForm = options.body instanceof FormData;
  const response = await fetch(API + path, { cache: 'no-store', ...options, headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers } });
  if (!response.ok) { let detail = ''; try { const problem = await response.json(); detail = problem.detail ?? problem.message ?? Object.values(problem.errors ?? {}).flat().find(Boolean) ?? ''; } catch { /* La respuesta puede no incluir JSON. */ } throw new Error(response.status === 401 ? 'Tu sesión ha expirado.' : String(detail || 'No pudimos completar esta acción.')); }
  return response.status === 204 ? null : response.json();
}

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

async function subscribeDevicePush() {
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

async function unsubscribeDevicePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  try { await api('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) }); } catch { /* El cierre de sesión debe continuar aunque el servidor no responda. */ }
  await subscription.unsubscribe();
}

let googleIdentityPromise: Promise<void> | null = null;
function ensureGoogleIdentityScript() {
  if ((window as any).google?.accounts) return Promise.resolve();
  if (googleIdentityPromise) return googleIdentityPromise;
  googleIdentityPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    const script = existing ?? document.createElement('script');
    const loaded = () => resolve();
    const failed = () => reject(new Error('No pudimos conectar con Google.'));
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) { script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.dataset.googleIdentity = 'true'; document.head.appendChild(script); }
  });
  return googleIdentityPromise;
}

async function requestGoogleCalendarAccess() {
  if (!GOOGLE_CLIENT_ID) throw new Error('Configura el Client ID de Google para crear reuniones.');
  await ensureGoogleIdentityScript();
  return new Promise<string>((resolve, reject) => {
    const google = (window as any).google;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      callback: (response: any) => response?.access_token ? resolve(response.access_token) : reject(new Error(response?.error_description || 'No autorizaste el acceso a Google Calendar.')),
      error_callback: () => reject(new Error('Se cerró la autorización de Google Calendar.'))
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

async function openChatAttachment(attachment: any) {
  const token = localStorage.getItem('conectamente_token');
  const response = await fetch(`${API}/api/adjuntos/${attachment.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('No pudimos abrir el archivo.');
  const url = URL.createObjectURL(await response.blob());
  if (attachment.contentType?.startsWith('image/') || attachment.contentType === 'application/pdf') window.open(url, '_blank', 'noopener,noreferrer');
  else { const anchor = document.createElement('a'); anchor.href = url; anchor.download = attachment.fileName; anchor.click(); }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function App() {
  const pwaUpdate = usePwaUpdate();
  const [mode, setMode] = useState<Mode>('welcome');
  const [tab, setTab] = useState<Tab>('inicio');
  const [showMore, setShowMore] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState('');
  const [profile, setProfile] = useState<any>({ habilidades: [], disponibilidad: null });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [messagesByConnection, setMessagesByConnection] = useState<Record<string, any[]>>({});
  const [chatConnectionId, setChatConnectionId] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [requestForm, setRequestForm] = useState({ topic: '', description: '', helpType: 'comprender', desiredSchedule: '' });
  const [logged, setLogged] = useState(() => Boolean(localStorage.getItem('conectamente_token')));
  const canViewPanel = me?.roles?.some((role: string) => role === 'coordinator' || role === 'moderator');
  const canViewAdmin = me?.roles?.some((role: string) => role === 'superadmin');
  const availableNavItems = navItems.filter(item => (item.id !== 'panel' || canViewPanel) && (item.id !== 'admin' || canViewAdmin));

  useEffect(() => { if (!logged) return; api('/api/usuarios/me').then(setMe).catch(showError); api('/api/perfil').then(setProfile).catch(showError); api('/api/solicitudes/mias').then(setRequests).catch(showError); api('/api/conexiones').then(setConnections).catch(showError); api('/api/sesiones').then(setSessions).catch(showError); api('/api/notificaciones').then(setNotifications).catch(showError); }, [logged]);
  useEffect(() => { if (logged && tab === 'perfil') api('/api/perfil').then(setProfile).catch(showError); if (logged && tab === 'solicitudes') api('/api/solicitudes/mias').then(setRequests).catch(showError); if (logged && (tab === 'agenda' || tab === 'seguridad')) Promise.all([api('/api/conexiones'), api('/api/sesiones')]).then(([currentConnections, currentSessions]) => { setConnections(currentConnections); setSessions(currentSessions); }).catch(showError); }, [logged, tab]);
  useEffect(() => {
    if (!logged || !me?.id) return;
    const token = localStorage.getItem('conectamente_token') ?? '';
    const realtime = new HubConnectionBuilder().withUrl(API + '/hubs/realtime', { accessTokenFactory: () => token }).withAutomaticReconnect().configureLogging(LogLevel.Warning).build();
    realtime.on('NotificationReceived', item => {
      setNotifications(current => current.some(entry => entry.id === item.id) ? current : [item, ...current]);
    });
    realtime.on('ChatMessageReceived', item => setMessagesByConnection(current => ({ ...current, [item.connectionId]: mergeMessage(current[item.connectionId] ?? [], { ...item, isMine: item.senderId === me?.id }) })));
    realtime.on('UserPresenceChanged', (userId: string, isOnline: boolean) => {
      setOnlineUsers(current => {
        const next = new Set(current);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });
    realtime.onreconnecting(() => setRealtimeConnected(false));
    realtime.onreconnected(() => {
      setRealtimeConnected(true);
      api('/api/usuarios/conectados').then((ids: string[]) => setOnlineUsers(new Set(ids))).catch(() => undefined);
    });
    realtime.onclose(() => {
      setRealtimeConnected(false);
      setOnlineUsers(new Set());
    });
    realtime.start().then(() => {
      setRealtimeConnected(true);
      api('/api/usuarios/conectados').then((ids: string[]) => setOnlineUsers(new Set(ids))).catch(() => undefined);
    }).catch(() => setRealtimeConnected(false));
    return () => { realtime.stop(); };
  }, [logged, me?.id]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const receivePush = (event: MessageEvent) => {
      if (event.data?.type !== 'PUSH_NOTIFICATION' || !event.data.payload) return;
      const item = event.data.payload;
      setNotifications(current => current.some(entry => entry.id === item.id) ? current : [item, ...current]);
    };
    navigator.serviceWorker.addEventListener('message', receivePush);
    return () => navigator.serviceWorker.removeEventListener('message', receivePush);
  }, []);
  useEffect(() => {
    if (!logged) return;
    const params = new URLSearchParams(window.location.search);
    const destination = params.get('push');
    const referenceId = params.get('referenceId');
    if (!destination) return;
    if (destination === 'mensajes') { if (referenceId) setChatConnectionId(referenceId); setTab('mensajes'); }
    else if (['inicio', 'agenda', 'ranking'].includes(destination)) setTab(destination as Tab);
    window.history.replaceState({}, '', window.location.pathname);
  }, [logged]);
  function showError(error: unknown) { if (error instanceof Error && error.message === 'Tu sesión ha expirado.') { unsubscribeDevicePush().catch(() => undefined); localStorage.removeItem('conectamente_token'); setMe(null); setLogged(false); setMode('login'); setTab('inicio'); setNotice(error.message); return; } setNotice(error instanceof Error ? error.message : 'Ocurrió un error.'); }
  async function signOut() { await unsubscribeDevicePush(); localStorage.removeItem('conectamente_token'); setMe(null); setLogged(false); setMode('welcome'); setTab('inicio'); }

  async function authSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const path = mode === 'login' ? '/api/auth/login' : mode === 'register' ? '/api/auth/registro' : '/api/auth/recuperar-contrasena';
    try { const result = await api(path, { method: 'POST', body: JSON.stringify(data) }); if (result?.accessToken) { localStorage.setItem('conectamente_token', result.accessToken); setLogged(true); setMe(result.user); setMode('welcome'); } else setNotice('Si los datos son válidos, recibirás instrucciones para continuar.'); }
    catch (error) { showError(error); } finally { setBusy(false); }
  }
  async function googleLogin(credential: string) { try { const result = await api('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }); localStorage.setItem('conectamente_token', result.accessToken); setLogged(true); setMe(result.user); setMode('welcome'); } catch (error) { showError(error); } }
  async function createRequest(event: FormEvent) { event.preventDefault(); try { await api('/api/solicitudes', { method: 'POST', body: JSON.stringify(requestForm) }); setRequestForm({ topic: '', description: '', helpType: 'comprender', desiredSchedule: '' }); setNotice('Solicitud publicada. Ya puedes buscar compañeros compatibles.'); setRequests(await api('/api/solicitudes/mias')); } catch (error) { showError(error); } }
  async function calculate(requestId: string) { try { await api('/api/solicitudes/' + requestId + '/calcular-coincidencias', { method: 'POST' }); setSelectedRequest(requestId); setMatches(await api('/api/solicitudes/' + requestId + '/coincidencias')); setTab('coincidencias'); setNotice('Encontramos compañeros compatibles con tu solicitud.'); } catch (error) { showError(error); } }
  async function navigate(next: Tab) { setTab(next); setShowMore(false); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); try { if (next === 'perfil') setProfile(await api('/api/perfil')); if (next === 'solicitudes') setRequests(await api('/api/solicitudes/mias')); if (next === 'mensajes') setConnections(await api('/api/conexiones')); if (next === 'agenda' || next === 'seguridad') { const [currentConnections, currentSessions] = await Promise.all([api('/api/conexiones'), api('/api/sesiones')]); setConnections(currentConnections); setSessions(currentSessions); } } catch (error) { showError(error); } }
  async function markAllRead() { await api('/api/notificaciones/leer-todas', { method: 'POST' }); setNotifications(current => current.map(item => ({ ...item, isRead: true }))); }
  async function openNotification(item: any) { if (!item.isRead) { await api('/api/notificaciones/' + item.id + '/leer', { method: 'POST' }); setNotifications(current => current.map(entry => entry.id === item.id ? { ...entry, isRead: true } : entry)); } setShowNotifications(false); if (item.referenceId && ['message', 'connection_accepted', 'session', 'comment'].includes(item.type)) { setChatConnectionId(item.referenceId); navigate('mensajes'); } else if (item.type === 'connection_request') navigate('agenda'); }
  const unreadCount = notifications.filter(item => !item.isRead).length;
  const primaryNavItems = navItems.slice(0, 4);
  const secondaryTabActive = ['perfil', 'ranking', 'agenda', 'seguridad', 'panel', 'admin'].includes(tab);
  const bottomActiveIndex = showMore || secondaryTabActive ? 4 : Math.max(0, primaryNavItems.findIndex(item => item.id === tab));
  const isChatActive = tab === 'mensajes';
  const isChatMobileConversation = isChatActive && Boolean(chatConnectionId) && typeof window !== 'undefined' && window.innerWidth < 900;
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!isChatMobileConversation || typeof window === 'undefined') return;

    const syncViewport = () => {
      const vv = window.visualViewport;
      if (vv) {
        const height = vv.height;
        document.documentElement.style.setProperty('--chat-vh', `${height}px`);
        document.documentElement.style.setProperty('--chat-vt', `${vv.offsetTop}px`);
        setIsKeyboardOpen((window.innerHeight - height) > 100);
      } else {
        document.documentElement.style.setProperty('--chat-vh', `${window.innerHeight}px`);
        document.documentElement.style.setProperty('--chat-vt', '0px');
      }
    };

    syncViewport();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', syncViewport);
      vv.addEventListener('scroll', syncViewport);
    }
    window.addEventListener('resize', syncViewport);

    document.documentElement.classList.add('mobile-chat-open');
    document.body.classList.add('mobile-chat-open');

    return () => {
      if (vv) {
        vv.removeEventListener('resize', syncViewport);
        vv.removeEventListener('scroll', syncViewport);
      }
      window.removeEventListener('resize', syncViewport);
      document.documentElement.style.removeProperty('--chat-vh');
      document.documentElement.style.removeProperty('--chat-vt');
      document.documentElement.classList.remove('mobile-chat-open');
      document.body.classList.remove('mobile-chat-open');
    };
  }, [isChatMobileConversation]);

  const messagesView = <Messages connections={connections} selectedId={chatConnectionId} setSelectedId={setChatConnectionId} messagesByConnection={messagesByConnection} setMessagesByConnection={setMessagesByConnection} realtimeConnected={realtimeConnected} notify={setNotice} navigate={navigate} onlineUsers={onlineUsers} />;

  if (!logged) return <><Welcome mode={mode} setMode={setMode} notice={notice} busy={busy} submit={authSubmit} googleLogin={googleLogin} /><UpdatePrompt {...pwaUpdate} /></>;

  return <><div className={`app-layout ${isChatActive ? 'in-chat-screen' : ''} ${isChatMobileConversation ? 'in-chat-mobile in-conversation-active' : ''} ${isKeyboardOpen ? 'keyboard-open' : ''}`}>
    <aside className="sidebar"><Brand /><nav className="side-nav" aria-label="Navegación principal">{availableNavItems.map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />)}</nav><div className="sidebar-note"><IsoBadge kind="network" /><p>Conexiones cuidadas, aprendizaje compartido.</p></div></aside>
    <main className="app-main">
      <header className="mobile-header"><Brand /><div className="header-actions"><NotificationButton count={unreadCount} onClick={() => setShowNotifications(true)} /><button className="avatar-button" aria-label="Abrir perfil" onClick={() => navigate('perfil')}><ProfileAvatar userId={me?.id} name={me?.displayName} version={me?.avatarUpdatedAt} /></button></div></header>
      <header className="desktop-topbar"><div><span className={realtimeConnected ? 'presence-dot' : 'presence-dot offline'} />{realtimeConnected ? 'Comunidad conectada' : 'Reconectando…'}</div><div className="user-menu"><NotificationButton count={unreadCount} onClick={() => setShowNotifications(true)} /><span>{me?.displayName ?? 'Estudiante'}</span><button className="avatar-button" onClick={() => navigate('perfil')}><ProfileAvatar userId={me?.id} name={me?.displayName} version={me?.avatarUpdatedAt} /></button><button className="logout" onClick={signOut}>Salir</button></div></header>
      <div className="screen-content">
        {notice && <div className="toast" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Cerrar mensaje">×</button></div>}
        {tab === 'inicio' && <Home me={me} profile={profile} requests={requests} connections={connections} navigate={navigate} />}
        {tab === 'perfil' && <Profile profile={profile} setProfile={setProfile} notify={setNotice} userId={me?.id} user={me} setMe={setMe} />}
        {tab === 'solicitudes' && <Requests requests={requests} form={requestForm} setForm={setRequestForm} submit={createRequest} calculate={calculate} notify={setNotice} />}
        {tab === 'coincidencias' && <ConnectionsExplorer matches={matches} requestId={selectedRequest} notify={setNotice} onRequestTopic={(topic: string) => { setRequestForm({ ...requestForm, topic, description: `Quiero encontrar una persona para aprender sobre ${topic}.`, helpType: 'comprender', desiredSchedule: '' }); navigate('solicitudes'); }} />}
        {tab === 'mensajes' && messagesView}
        {tab === 'ranking' && <Ranking notify={setNotice} />}
        {tab === 'agenda' && <Agenda connections={connections} sessions={sessions} setConnections={setConnections} setSessions={setSessions} notify={setNotice} />}
        {tab === 'seguridad' && <Security connections={connections} notify={setNotice} />}
        {tab === 'panel' && <InstitutionalPanel />}
        {tab === 'admin' && <AdminPanel notify={setNotice} />}
      </div>
      <nav className="bottom-nav" aria-label="Navegación móvil" style={{ '--active-index': bottomActiveIndex } as CSSProperties}><span className="bottom-nav-indicator" aria-hidden="true" />{primaryNavItems.map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />)}<button className={showMore || secondaryTabActive ? 'nav-button active' : 'nav-button'} onClick={() => setShowMore(true)}><Icon name="more" /><span>Más</span></button></nav>
      {showMore && <div className="sheet-backdrop" onClick={() => setShowMore(false)}><section className="more-sheet" onClick={event => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-title"><div><p className="eyebrow">MÁS OPCIONES</p><h2>Tu espacio completo</h2></div><button className="close-button" onClick={() => setShowMore(false)}>×</button></div>{availableNavItems.slice(4).map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />)}<button className="sheet-logout" onClick={signOut}>Cerrar sesión</button></section></div>}
      {showNotifications && <NotificationsPanel items={notifications} onClose={() => setShowNotifications(false)} onOpen={openNotification} onMarkAll={markAllRead} />}
    </main>
  </div><UpdatePrompt {...pwaUpdate} /></>;
}

function usePwaUpdate() {
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

function UpdatePrompt({ available, updating, applyUpdate }: { available: boolean; updating: boolean; applyUpdate: () => void }) {
  if (!available) return null;
  return <aside className="update-prompt" role="status" aria-live="polite"><IsoBadge kind="network" /><div><span>NUEVA VERSIÓN</span><strong>Hay mejoras listas</strong><p>Actualiza para traer los últimos cambios.</p></div><button className="button button-light small" onClick={applyUpdate} disabled={updating}>{updating ? 'Actualizando…' : 'Actualizar ahora'}</button></aside>;
}

function Welcome({ mode, setMode, notice, busy, submit, googleLogin }: any) {
  if (mode === 'welcome') return <main className="welcome-screen"><Brand large /><section className="welcome-stage"><div className="landing-art"><img src="/illustrations/login-community.png" alt="Estudiantes compartiendo ideas y aprendiendo juntos" /></div><p className="eyebrow centered">UNA RED PARA APRENDER</p><h1>Aprender es mejor <em>en compañía.</em></h1><p className="welcome-lead">Encuentra apoyo académico entre compañeros, comparte lo que sabes y avanza con confianza.</p><div className="welcome-actions"><button className="button button-primary" onClick={() => setMode('register')}>Crear mi cuenta <span>↗</span></button><button className="button button-secondary" onClick={() => setMode('login')}>Ya tengo una cuenta</button></div><GoogleButton onCredential={googleLogin} /></section><footer className="welcome-footer"><IsoBadge kind="book" /><span>Aprendizaje entre pares</span><span className="footer-divider" /><IsoBadge kind="network" /><span>Privacidad desde el diseño</span></footer></main>;
  const register = mode === 'register';
  return <main className="auth-screen"><button className="back-link" onClick={() => setMode('welcome')}>← Volver al inicio</button><div className="auth-layout"><section className="auth-visual"><Brand light /><img src="/illustrations/login-community.png" alt="Comunidad de estudiantes conectados" /><div><p className="eyebrow">APRENDER JUNTOS</p><h2>Tu próxima conexión puede cambiar cómo entiendes un tema.</h2></div></section><section className="auth-panel"><p className="eyebrow">ACCESO SEGURO</p><h1>{register ? 'Crea tu espacio' : mode === 'login' ? 'Qué bueno verte' : 'Recupera tu acceso'}</h1><p className="form-intro">{register ? 'Cuéntanos lo esencial. Tu perfil académico se completa después.' : mode === 'login' ? 'Continúa aprendiendo y compartiendo con tu comunidad.' : 'Te enviaremos instrucciones si encontramos tu cuenta.'}</p><form onSubmit={submit}>{register && <div className="field-grid"><label>Nombre o alias<input name="displayName" autoComplete="name" required /></label><label>Carrera<input name="career" required /></label><label>Periodo académico<input name="academicTerm" required /></label></div>}<label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>{mode !== 'recover' && <label>Contraseña<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={8} required /></label>}<button className="button button-primary full-width" disabled={busy}>{busy ? 'Procesando…' : register ? 'Crear cuenta' : mode === 'login' ? 'Iniciar sesión' : 'Enviar instrucciones'}</button></form>{mode !== 'recover' && <><div className="or-divider"><span>o continúa con</span></div><GoogleButton onCredential={googleLogin} /></>}{notice && <p className="inline-message" role="alert">{notice}</p>}{mode === 'login' && <button className="text-button" onClick={() => setMode('recover')}>¿Olvidaste tu contraseña?</button>}</section></div></main>;
}

function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!GOOGLE_CLIENT_ID) return; let cancelled = false; ensureGoogleIdentityScript().then(() => { const google = (window as any).google; if (cancelled || !target.current) return; google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (response: { credential: string }) => onCredential(response.credential) }); google.accounts.id.renderButton(target.current, { theme: 'outline', size: 'large', width: 340, text: 'continue_with', shape: 'pill' }); }).catch(() => undefined); return () => { cancelled = true; }; }, [onCredential]);
  if (!GOOGLE_CLIENT_ID) return <p className="google-note">Google estará disponible al configurar el Client ID.</p>;
  return <div className="google-wrap" ref={target} />;
}

function Home({ me, profile, requests, connections, navigate }: any) {
  const skills = profile.habilidades?.length ?? 0; const activeConnections = connections.filter((item: any) => item.status === 'Activa' || item.status === 1).length;
  const next = skills === 0 ? { title: 'Completa tu mapa de aprendizaje', text: 'Agrega los temas que dominas y aquellos en los que buscas apoyo para mejorar tus conexiones.', action: 'Ir a mi perfil', tab: 'perfil' } : requests.length === 0 ? { title: 'Convierte una duda en un encuentro', text: 'Publica aquello que quieres comprender y te mostraremos compañeros compatibles.', action: 'Pedir apoyo', tab: 'solicitudes' } : { title: 'Tu red de aprendizaje ya está en marcha', text: 'Revisa tus coincidencias y organiza el siguiente encuentro con un objetivo claro.', action: 'Ver conexiones', tab: 'coincidencias' };
  return <section className="screen home-screen"><ScreenIntro kicker="TU COMUNIDAD" title={`Hola, ${me?.displayName ?? 'estudiante'}`} description="Hoy puede ser un buen día para resolver una duda o compartir algo que ya dominas." badge="book" /><div className="home-hero"><div><span className="soft-label">SIGUIENTE PASO</span><h2>{next.title}</h2><p>{next.text}</p><button className="button button-light" onClick={() => navigate(next.tab)}>{next.action} <span>→</span></button></div><img src="/illustrations/learning-icons.png" alt="Libro, conversación y conexiones" /></div><div className="metric-row"><article><strong>{skills}</strong><span>temas en tu mapa</span></article><article><strong>{requests.length}</strong><span>solicitudes creadas</span></article><article><strong>{activeConnections}</strong><span>conexiones activas</span></article></div><div className="section-heading"><div><p className="eyebrow">ACCESOS RÁPIDOS</p><h2>¿Qué quieres hacer?</h2></div></div><div className="action-grid"><ActionCard badge="chat" title="Pedir apoyo" text="Publica una duda con tus propias palabras." onClick={() => navigate('solicitudes')} /><ActionCard badge="network" title="Ver conexiones" text="Conoce por qué cada compañero es compatible." onClick={() => navigate('coincidencias')} /><ActionCard badge="chat" title="Abrir mensajes" text="Continúa aprendiendo en tiempo real." onClick={() => navigate('mensajes')} /><ActionCard badge="book" title="Organizar sesión" text="Propón fecha, duración y objetivo." onClick={() => navigate('agenda')} /></div></section>;
}

function getSkillConfidenceLabel(confidence: number) {
  switch (Number(confidence)) {
    case 1: return '1/5 · Básico (repaso inicial)';
    case 2: return '2/5 · Intermedio (temas fundamentales)';
    case 3: return '3/5 · Buen dominio (resolución de dudas)';
    case 4: return '4/5 · Nivel avanzado (acompañamiento completo)';
    case 5: return '5/5 · Nivel experto (dominio profundo)';
    default: return `${confidence}/5`;
  }
}

function Profile({ profile, setProfile, notify, userId, user, setMe }: any) {
  const [skill, setSkill] = useState({ topic: '', type: 'Domina', confidence: 4, visible: true });
  const [details, setDetails] = useState({ displayName: user?.displayName ?? '', career: user?.career ?? '', academicTerm: user?.academicTerm ?? '' });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [pendingSkillDelete, setPendingSkillDelete] = useState<any | null>(null);
  const [reputation, setReputation] = useState<any>(null);
  useEffect(() => { if (userId) api('/api/usuarios/' + userId + '/reputacion').then(setReputation).catch(() => undefined); }, [userId]);
  useEffect(() => { setDetails({ displayName: user?.displayName ?? '', career: user?.career ?? '', academicTerm: user?.academicTerm ?? '' }); }, [user?.displayName, user?.career, user?.academicTerm]);
  useEffect(() => { if (!avatarFile) { setAvatarPreview(''); return; } const url = URL.createObjectURL(avatarFile); setAvatarPreview(url); return () => URL.revokeObjectURL(url); }, [avatarFile]);
  async function add(event: FormEvent) { event.preventDefault(); try { await api(editingSkillId ? '/api/perfil/habilidades/' + editingSkillId : '/api/perfil/habilidades', { method: editingSkillId ? 'PUT' : 'POST', body: JSON.stringify({ ...skill, type: 'Domina', confidence: Number(skill.confidence) }) }); setProfile(await api('/api/perfil')); setSkill({ topic: '', type: 'Domina', confidence: 4, visible: true }); setEditingSkillId(null); notify(editingSkillId ? 'Materia de apoyo actualizada.' : 'Materia agregada a tu perfil de orientador.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos guardar el tema.'); } }
  function editSkill(item: any) { setEditingSkillId(item.id); setSkill({ topic: item.topic, type: 'Domina', confidence: item.confidence ?? 4, visible: item.visible ?? true }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function deleteSkill() { if (!pendingSkillDelete) return; const item = pendingSkillDelete; setPendingSkillDelete(null); try { await api('/api/perfil/habilidades/' + item.id, { method: 'DELETE' }); setProfile(await api('/api/perfil')); if (editingSkillId === item.id) { setEditingSkillId(null); setSkill({ topic: '', type: 'Domina', confidence: 4, visible: true }); } notify('Materia eliminada de tus temas de apoyo.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos eliminar la materia.'); } }
  async function saveDetails(event: FormEvent) { event.preventDefault(); setSavingDetails(true); try { const updated = await api('/api/perfil/datos', { method: 'PUT', body: JSON.stringify(details) }); setMe(updated); notify('Datos del perfil actualizados.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos actualizar tu perfil.'); } finally { setSavingDetails(false); } }
  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { notify('Elige una foto JPG, PNG o WebP.'); return; } if (file.size > 5 * 1024 * 1024) { notify('La foto debe pesar menos de 5 MB.'); return; } setAvatarFile(file); }
  async function saveAvatar() { if (!avatarFile) return; setSavingAvatar(true); try { const form = new FormData(); form.append('file', avatarFile); const updated = await api('/api/perfil/avatar', { method: 'PUT', body: form }); setMe(updated); setAvatarFile(null); notify('Foto de perfil actualizada.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos actualizar tu foto.'); } finally { setSavingAvatar(false); } }
  return <section className="screen"><ScreenIntro kicker="MI PERFIL" title="Tu perfil de orientador" description="Registra las materias que dominas para que tus compañeros puedan solicitar tu orientación." badge="book" />{reputation && <ReputationSummary reputation={reputation} title="Mi reputación como colaborador" /> }<section className="profile-editor surface-card"><div className="profile-editor-visual"><div className="profile-avatar-frame">{avatarPreview ? <img src={avatarPreview} alt="Vista previa de tu foto" /> : <ProfileAvatar userId={userId} name={user?.displayName} version={user?.avatarUpdatedAt} />}</div><div><p className="eyebrow">IDENTIDAD VISIBLE</p><h2>Tu presentación</h2><p>Una foto y un nombre claro ayudan a crear conexiones más humanas.</p></div></div><div className="profile-editor-actions"><label className="button button-secondary small">{avatarFile ? 'Cambiar foto' : 'Elegir foto'}<input className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} /></label>{avatarFile && <button type="button" className="button button-primary small" onClick={saveAvatar} disabled={savingAvatar}>{savingAvatar ? 'Guardando…' : 'Guardar foto'}</button>}<small>JPG, PNG o WebP · máximo 5 MB</small></div></section><form className="surface-card profile-details" onSubmit={saveDetails}><CardHeading number="01" title="Editar datos personales" text="Actualiza cómo quieres que te conozca la comunidad." /><div className="field-grid"><label>Nombre o alias<input value={details.displayName} maxLength={120} onChange={event => setDetails({ ...details, displayName: event.target.value })} required /></label><label>Correo electrónico<input value={user?.email ?? ''} type="email" disabled /><small>El correo es tu identificador de acceso y no se cambia desde aquí.</small></label><label>Carrera o área<input value={details.career} maxLength={160} onChange={event => setDetails({ ...details, career: event.target.value })} required /></label><label>Periodo académico<input value={details.academicTerm} maxLength={80} onChange={event => setDetails({ ...details, academicTerm: event.target.value })} required /></label></div><button className="button button-primary" disabled={savingDetails}>{savingDetails ? 'Guardando cambios…' : 'Guardar cambios'}</button></form><div className="content-grid"><form className="surface-card form-surface" onSubmit={add}><CardHeading number="02" title={editingSkillId ? "Editar materia de apoyo" : "Ofrecer apoyo en una materia"} text={editingSkillId ? "Actualiza tu nivel de dominio en este conocimiento." : "Registra las materias en las que puedes orientar o brindar apoyo a otros compañeros."} /><div className="skill-badge-note"><span className="skill-role-badge">🎓 Rol: Orientador / Tutor</span><small>Esta sección es para registrar los temas que dominas y en los que puedes guiar a otros estudiantes.</small></div><label>Materia o tema que dominas<input value={skill.topic} onChange={event => setSkill({ ...skill, topic: event.target.value })} placeholder="Ej. Bases de datos, Cálculo diferencial, Python…" required /></label><div className="confidence-level-block"><div className="confidence-level-header"><label htmlFor="skill-confidence">Nivel de dominio o confianza</label><span className="confidence-tag">{getSkillConfidenceLabel(skill.confidence)}</span></div><input id="skill-confidence" type="range" min="1" max="5" value={skill.confidence} onChange={event => setSkill({ ...skill, confidence: Number(event.target.value) })} /><div className="confidence-scale-labels"><span>1 · Básico</span><span>3 · Buen dominio</span><span>5 · Nivel experto</span></div></div><div className="form-actions"><button className="button button-primary">{editingSkillId ? "Guardar cambios" : "Agregar a mis materias de apoyo"}</button>{editingSkillId && <button type="button" className="button button-ghost" onClick={() => { setEditingSkillId(null); setSkill({ topic: "", type: "Domina", confidence: 4, visible: true }); }}>Cancelar</button>}</div></form><section className="surface-card"><CardHeading number="03" title="Mis materias para orientar" text={`${profile.habilidades?.length ?? 0} materias registradas`} /><div className="skill-list">{profile.habilidades?.length ? profile.habilidades.map((item: any) => <article className="skill-row" key={item.id}><IsoBadge kind="book" /><div><strong>{item.topic}</strong><span>Puedo orientar · {getSkillConfidenceLabel(item.confidence ?? 4)}</span></div><span className="confidence">{item.confidence ?? 4}/5</span><div className="skill-row-actions"><button type="button" className="button button-secondary small" onClick={() => editSkill(item)}>Editar</button><button type="button" className="button button-danger small" onClick={() => setPendingSkillDelete(item)}>Eliminar</button></div></article>) : <EmptyState title="Aún no has registrado materias" text="Agrega los temas que dominas para que los compañeros que busquen apoyo puedan encontrarte y solicitar tu orientación." badge="book" />}</div></section></div>{pendingSkillDelete && <ConfirmDialog title="¿Eliminar esta materia?" message={`Se quitará “${pendingSkillDelete.topic}” de tus materias de apoyo. Ya no aparecerás en las sugerencias para este tema.`} confirmLabel="Eliminar materia" onConfirm={deleteSkill} onCancel={() => setPendingSkillDelete(null)} />}</section>;
}

function Ranking({ notify }: { notify: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [reputation, setReputation] = useState<any | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => api('/api/ranking?topic=' + encodeURIComponent(query)).then(data => { if (!cancelled) setItems(data); }).catch(error => { if (!cancelled) notify(error instanceof Error ? error.message : 'No pudimos cargar el ranking.'); }).finally(() => { if (!cancelled) setLoading(false); }), 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);
  async function openProfile(item: any) { setSelected(item); setReputation(null); try { setReputation(await api('/api/usuarios/' + item.userId + '/reputacion')); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos abrir estas valoraciones.'); } }
  return <section className="screen"><ScreenIntro kicker="REPUTACIÓN ACADÉMICA" title="Personas que dejan huella" description="Explora colaboradores valorados por quienes recibieron su orientación. La constancia pesa tanto como una buena nota." badge="network" /><section className="ranking-search surface-card"><div className="search-field"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filtra por tema: cálculo, inglés, programación…" aria-label="Buscar colaboradores por tema" /></div><p><Icon name="shield" /> El orden se ajusta por experiencia para evitar resultados engañosos con una sola valoración.</p></section>{loading ? <div className="discovery-loading"><span /><span /><span /></div> : items.length ? <div className="ranking-list">{items.map(item => <button className="ranking-card" key={`${item.userId}-${item.topic}`} onClick={() => openProfile(item)}><span className={`ranking-position${item.position <= 3 ? ' podium' : ''}`}>{item.position <= 3 ? ['🥇','🥈','🥉'][item.position - 1] : `#${item.position}`}</span><span className="ranking-avatar">{initials(item.displayName)}</span><span className="ranking-copy"><strong>{item.displayName}</strong><small>{item.topic} · {item.career || 'Comunidad ConectaMentes'}</small><span><StarDisplay value={item.average} /> <b>{Number(item.average).toFixed(1)}</b> · {item.totalRatings} {item.totalRatings === 1 ? 'valoración' : 'valoraciones'}</span></span><span className="ranking-arrow">→</span></button>)}</div> : <EmptyState title="Aún no hay valoraciones para este tema" text="El ranking aparecerá cuando se completen y califiquen orientaciones." badge="network" />}{selected && <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setSelected(null); }}><section className="custom-dialog reputation-dialog" role="dialog" aria-modal="true" aria-labelledby="reputation-title"><div className="custom-dialog-head"><span className="dialog-icon"><Icon name="star" /></span><button type="button" className="dialog-close" onClick={() => setSelected(null)} aria-label="Cerrar valoraciones">×</button></div><p className="eyebrow">PERFIL DE COLABORACIÓN</p><h2 id="reputation-title">{selected.displayName}</h2>{reputation ? <ReputationSummary reputation={reputation} compact title="Valoraciones recibidas" /> : <p>Cargando valoraciones…</p>}</section></div>}</section>;
}

function ReputationSummary({ reputation, title, compact = false }: { reputation: any; title: string; compact?: boolean }) {
  if (!reputation?.total) return <section className={`reputation-summary${compact ? ' compact' : ''}`}><div><p className="eyebrow">REPUTACIÓN</p><h2>{title}</h2><p className="reputation-empty">Tus calificaciones aparecerán aquí después de impartir una orientación completada.</p></div></section>;
  return <section className={`reputation-summary${compact ? ' compact' : ''}`}><div className="reputation-score"><span>{Number(reputation.average).toFixed(1)}</span><StarDisplay value={reputation.average} /><small>{reputation.total} {reputation.total === 1 ? 'valoración' : 'valoraciones'}</small></div><div className="reputation-body"><p className="eyebrow">REPUTACIÓN</p><h2>{title}</h2><div className="dimension-grid"><span><b>{Number(reputation.clarity).toFixed(1)}</b>Claridad</span><span><b>{Number(reputation.usefulness).toFixed(1)}</b>Utilidad</span><span><b>{Number(reputation.fulfillment).toFixed(1)}</b>Cumplimiento</span><span><b>{Number(reputation.respect).toFixed(1)}</b>Respeto</span></div>{reputation.topics?.length > 0 && <div className="topic-ratings">{reputation.topics.map((item: any) => <span key={item.topic}><b>{item.topic}</b><StarDisplay value={item.average} /><small>{Number(item.average).toFixed(1)} · {item.total}</small></span>)}</div>}{reputation.comments?.length > 0 && <div className="rating-comments">{reputation.comments.slice(0, compact ? 6 : 3).map((item: any, index: number) => <blockquote key={`${item.createdAt}-${index}`}><p>“{item.comment}”</p><footer>{item.topic} · {formatDominicanDate(item.createdAt)}</footer></blockquote>)}</div>}</div></section>;
}

function StarDisplay({ value }: { value: number }) { const rounded = Math.round(Number(value)); return <span className="star-display" aria-label={`${Number(value).toFixed(1)} de 5 estrellas`}>{Array.from({ length: 5 }, (_, index) => <i className={index < rounded ? 'filled' : ''} key={index}>★</i>)}</span>; }

function Requests({ requests, form, setForm, submit, calculate, notify }: any) {
  const [showAi, setShowAi] = useState(false);

  return (
    <section className="screen">
      <ScreenIntro
        kicker="PEDIR APOYO"
        title="Cuéntanos qué necesitas"
        description="Publica tu duda de forma sencilla o usa el asistente IA para redactarla en segundos."
        badge="chat"
      />
      <div className="content-grid requests-grid">
        <form className="surface-card form-surface simplified-request-form" onSubmit={submit}>
          <div className="card-heading-row">
            <CardHeading number="01" title="Nueva solicitud" text="Solo dos campos. Escribe directo o usa la IA." />
            <button
              type="button"
              className="ai-trigger-button"
              onClick={() => setShowAi(true)}
              title="Redactar con Asistente IA"
            >
              <span className="ai-stars" aria-hidden="true">✨</span>
              <span>Redactar con IA</span>
            </button>
          </div>

          <label>
            ¿Sobre qué tema necesitas apoyo?
            <input
              value={form.topic}
              onChange={event => setForm({ ...form, topic: event.target.value })}
              placeholder="Ej. Integrales por partes, programación en Python…"
              required
            />
          </label>

          <label>
            ¿Qué necesitas o qué quieres lograr?
            <textarea
              value={form.description}
              onChange={event => setForm({ ...form, description: event.target.value })}
              placeholder="Describe con tus palabras qué dudas tienes o qué quieres practicar con tu compañero(a)."
              rows={4}
              required
            />
          </label>

          <div className="request-tip">
            <IsoBadge kind="book" />
            <span>
              <strong>Hazlo simple</strong>
              <small>Solo indica el tema y qué quieres aprender. La comunidad te ayudará a precisarlo.</small>
            </span>
          </div>

          <div className="guidance-note">
            <Icon name="shield" />
            <span>Conecta para aprender: el apoyo es para comprender y resolver dudas juntos.</span>
          </div>

          <button className="button button-primary">
            Encontrar apoyo <span>→</span>
          </button>
        </form>

        <section>
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">HISTORIAL</p>
              <h2>Mis solicitudes</h2>
            </div>
            <span className="count-badge">{requests.length}</span>
          </div>
          <div className="request-list">
            {requests.length ? (
              requests.map((item: any) => (
                <article className="request-card" key={item.id}>
                  <div className="request-top">
                    <IsoBadge kind="chat" />
                    <span className="status-pill">{humanStatus(item.status)}</span>
                  </div>
                  <h3>{item.topic}</h3>
                  <p>{item.description}</p>
                  <button className="button button-secondary small" onClick={() => calculate(item.id)}>
                    Buscar compañeros <span>→</span>
                  </button>
                </article>
              ))
            ) : (
              <EmptyState
                title="Aún no has publicado solicitudes"
                text="Cuando publiques una duda, podrás seguir su estado desde aquí."
                badge="chat"
              />
            )}
          </div>
        </section>
      </div>

      <AiRequestDialog
        open={showAi}
        onClose={() => setShowAi(false)}
        onApply={(topic: string, description: string) => setForm({ ...form, topic, description })}
        notify={notify}
      />
    </section>
  );
}

function AiRequestDialog({ open, onClose, onApply, notify }: { open: boolean; onClose: () => void; onApply: (topic: string, description: string) => void; notify: (msg: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{ topic: string; description: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setPrompt('');
      setSuggestion(null);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await api('/api/solicitudes/asistente-ia', {
        method: 'POST',
        body: JSON.stringify({ prompt: prompt.trim() })
      });
      setSuggestion({ topic: res.topic || '', description: res.description || '' });
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'No pudimos generar la sugerencia con IA.');
    } finally {
      setLoading(false);
    }
  }

  function handleAccept() {
    if (!suggestion) return;
    onApply(suggestion.topic.trim(), suggestion.description.trim());
    onClose();
    notify('Sugerencia de IA aplicada a tu solicitud.');
  }

  return (
    <div
      className="custom-dialog-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="custom-dialog ai-assistant-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-dialog-title"
        aria-describedby="ai-dialog-desc"
      >
        <div className="custom-dialog-head">
          <span className="dialog-icon ai-icon-badge" aria-hidden="true">✨</span>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Cerrar asistente">×</button>
        </div>

        <p className="eyebrow">ASISTENTE INTELIGENTE</p>
        <h2 id="ai-dialog-title">Redactar con IA</h2>
        <p id="ai-dialog-desc">
          Escribe con tus propias palabras qué quieres aprender o qué se te dificulta. La IA te sugerirá un tema y una descripción clara.
        </p>

        <form onSubmit={handleGenerate} className="ai-dialog-form">
          <label>
            ¿Qué necesitas o qué quieres aprender?
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Ej. No entiendo integrales por partes y me confundo al elegir u y dv para mi examen de cálculo..."
              rows={3}
              required
              disabled={loading}
              autoFocus
            />
          </label>
          <button
            type="submit"
            className="button button-primary ai-submit-btn"
            disabled={loading || !prompt.trim()}
          >
            {loading ? 'Generando con IA…' : '✨ Generar sugerencia'}
          </button>
        </form>

        {suggestion && (
          <div className="ai-suggestion-box">
            <div className="ai-suggestion-header">
              <span>Sugerencia lista</span>
              <small>Puedes ajustar los campos antes de aplicarlos</small>
            </div>
            <label>
              Tema propuesto
              <input
                value={suggestion.topic}
                onChange={e => setSuggestion({ ...suggestion, topic: e.target.value })}
                placeholder="Tema"
                required
              />
            </label>
            <label>
              Descripción propuesta
              <textarea
                value={suggestion.description}
                onChange={e => setSuggestion({ ...suggestion, description: e.target.value })}
                rows={3}
                placeholder="Descripción"
                required
              />
            </label>
            <div className="custom-dialog-actions ai-actions-row">
              <button type="button" className="button button-ghost" onClick={() => setSuggestion(null)}>
                Volver a escribir
              </button>
              <button type="button" className="button button-primary" onClick={handleAccept}>
                ✓ Usar en mi solicitud
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ConnectionsExplorer({ matches, requestId, notify, onRequestTopic }: any) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('todos');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => api(`/api/descubrimiento?topic=${encodeURIComponent(query)}&type=${kind === 'todos' ? '' : kind}`)
      .then(items => { if (!cancelled) setResults(items); })
      .catch(error => { if (!cancelled) notify(error instanceof Error ? error.message : 'No pudimos buscar en la comunidad.'); })
      .finally(() => { if (!cancelled) setLoading(false); }), 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, kind]);
  const labelFor = (item: any) => item.type === 'Domina' || item.type === 0 ? 'Puede reforzar conocimientos' : 'Busca apoyo para reforzar';
  return <section className="screen"><ScreenIntro kicker="DESCUBRIR COMUNIDAD" title="Encuentra personas por tema" description="Busca quién puede ayudarte o quién quiere aprender contigo. Solo aparecen temas que cada persona decidió compartir." badge="network" /><section className="discovery-search surface-card"><div className="search-field"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Busca un tema, una materia o una persona…" aria-label="Buscar en la comunidad" /></div><div className="discovery-filters" role="group" aria-label="Filtrar por intención"><button className={kind === 'todos' ? 'filter-chip active' : 'filter-chip'} onClick={() => setKind('todos')}>Todas las personas</button><button className={kind === 'Domina' ? 'filter-chip active' : 'filter-chip'} onClick={() => setKind('Domina')}><span className="filter-dot offer" />Puede ayudar</button><button className={kind === 'NecesitaApoyo' ? 'filter-chip active' : 'filter-chip'} onClick={() => setKind('NecesitaApoyo')}><span className="filter-dot need" />Necesita apoyo</button></div></section>{requestId && matches.length > 0 && <RequestMatches matches={matches} requestId={requestId} notify={notify} /> }<div className="section-heading discovery-heading"><div><p className="eyebrow">RESULTADOS ABIERTOS</p><h2>{loading ? 'Buscando personas…' : `${results.length} perfiles encontrados`}</h2></div><IsoBadge kind="chat" /></div>{loading ? <div className="discovery-loading"><span /><span /><span /></div> : results.length ? <div className="discovery-grid">{results.map(item => <article className="discovery-card" key={item.id}><div className="discovery-card-top"><span className="discovery-avatar">{initials(item.displayName)}</span><span className={item.type === 'Domina' || item.type === 0 ? 'intent-pill offer' : 'intent-pill need'}>{labelFor(item)}</span></div><h3>{item.topic}</h3><p className="discovery-person">{item.displayName} <span>·</span> {item.career || 'Comunidad ConectaMentes'}</p><div className="discovery-meta"><span>Confianza {item.confidence}/5</span>{item.hasConnection ? <span className="status-pill">Ya conectados</span> : <button className="button button-secondary small" onClick={() => onRequestTopic(item.topic)}>Aprender sobre este tema <span>→</span></button>}</div></article>)}</div> : <EmptyState title="No encontramos ese tema todavía" text="Prueba con otra palabra o publica una solicitud para que la comunidad pueda encontrarte." badge="network" />}</section>;
}

function RequestMatches({ matches, requestId, notify }: any) {
  async function accept(id: string) { try { await api('/api/coincidencias/' + id + '/aceptar', { method: 'POST' }); notify('Conexión propuesta. Falta la aceptación del colaborador.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos aceptar la coincidencia.'); } }
  async function reject(id: string) { try { await api('/api/coincidencias/' + id + '/rechazar', { method: 'POST' }); notify('Recomendación descartada sin penalización.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos rechazar la coincidencia.'); } }
  return <section className="screen"><ScreenIntro kicker="COMPATIBILIDAD EXPLICABLE" title="Personas que pueden ayudarte" description="Cada recomendación incluye una razón clara. Tú decides con quién conectar." badge="network" />{!requestId || matches.length === 0 ? <EmptyState title="Todavía no hay conexiones sugeridas" text="Publica una solicitud y selecciona “Buscar compañeros” para ver recomendaciones." badge="network" /> : <div className="match-grid">{matches.map((item: any, index: number) => <article className="match-card" key={item.id}><div className="match-avatar">{initials(item.candidate)}<span>{index + 1}</span></div><div className="match-score"><strong>{Math.round(item.score)}%</strong><span>compatible</span></div><h3>{item.candidate}</h3><p>{item.explanation}</p><div className="reason-chips"><span>Tema afín</span><span>Horario compatible</span></div><div className="card-actions"><button className="button button-primary small" onClick={() => accept(item.id)}>Conectar</button><button className="button button-ghost small" onClick={() => reject(item.id)}>Ahora no</button></div></article>)}</div>}</section>;
}

function Messages({ connections, selectedId, setSelectedId, messagesByConnection, setMessagesByConnection, realtimeConnected, notify, navigate, onlineUsers }: any) {
  const active = connections.filter((item: any) => item.status === 'Activa' || item.status === 1);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = messagesScrollRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight + 10000,
        behavior
      });
    }
  }, []);

  // Auto-seleccionar primer chat en pantallas grandes si no hay ninguno seleccionado
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 900 && !selectedId && active[0]) {
      setSelectedId(active[0].id);
    }
  }, [active.length, selectedId, setSelectedId]);

  const currentId = active.some((item: any) => item.id === selectedId)
    ? selectedId
    : (typeof window !== 'undefined' && window.innerWidth >= 900 ? (active[0]?.id ?? '') : '');
  const current = active.find((item: any) => item.id === currentId);
  const messages = currentId ? (messagesByConnection[currentId] ?? []) : [];
  const isCurrentOnline = Boolean(current?.counterpartId && onlineUsers?.has(current.counterpartId));

  useEffect(() => {
    if (!currentId || messagesByConnection[currentId]) return;
    api('/api/conexiones/' + currentId + '/mensajes')
      .then(items => setMessagesByConnection((value: any) => ({ ...value, [currentId]: items })))
      .catch((error: unknown) => notify(error instanceof Error ? error.message : 'No pudimos abrir la conversación.'));
  }, [currentId]);

  // Desplazamiento confiable al último mensaje al entrar al chat
  useEffect(() => {
    if (!currentId) return;

    scrollToBottom('auto');

    const frame = requestAnimationFrame(() => {
      scrollToBottom('auto');
      const frame2 = requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
      return () => cancelAnimationFrame(frame2);
    });

    const t1 = setTimeout(() => scrollToBottom('auto'), 50);
    const t2 = setTimeout(() => scrollToBottom('auto'), 150);
    const t3 = setTimeout(() => scrollToBottom('auto'), 320);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [currentId, scrollToBottom]);

  // Desplazamiento al recibir o actualizar mensajes
  useEffect(() => {
    if (!currentId || !messages.length) return;
    scrollToBottom('auto');
    const timer = setTimeout(() => scrollToBottom('auto'), 50);
    return () => clearTimeout(timer);
  }, [messages.length, currentId, scrollToBottom]);

  // Mantener scroll abajo cuando el teclado virtual cambie el tamaño del viewport
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const handleViewportResize = () => {
      scrollToBottom('auto');
    };
    const vv = window.visualViewport;
    vv.addEventListener('resize', handleViewportResize);
    return () => vv.removeEventListener('resize', handleViewportResize);
  }, [scrollToBottom]);

  // Keep the composer readable while typing, especially above the mobile keyboard.
  useEffect(() => {
    const input = draftInput.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
    input.style.overflowY = input.scrollHeight > 128 ? 'auto' : 'hidden';
  }, [draft]);

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setSelectedFile(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CHAT_FILE_BYTES) {
      notify('El archivo supera el límite de 10 MB.');
      event.target.value = '';
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : '');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if ((!draft.trim() && !selectedFile) || !currentId) return;
    setSending(true);
    try {
      let message;
      if (selectedFile) {
        const data = new FormData();
        data.append('file', selectedFile);
        data.append('caption', draft.trim());
        message = await api('/api/conexiones/' + currentId + '/adjuntos', { method: 'POST', body: data });
      } else {
        message = await api('/api/conexiones/' + currentId + '/mensajes', { method: 'POST', body: JSON.stringify({ text: draft }) });
      }
      setMessagesByConnection((value: any) => ({ ...value, [currentId]: mergeMessage(value[currentId] ?? [], message) }));
      setDraft('');
      clearFile();
      setTimeout(() => scrollToBottom('smooth'), 40);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No pudimos enviar el mensaje.');
    } finally {
      setSending(false);
    }
  }

  const filteredActive = active.filter((item: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (item.counterpart && item.counterpart.toLowerCase().includes(q)) ||
           (item.topic && item.topic.toLowerCase().includes(q));
  });

  if (!active.length) {
    return (
      <section className="screen">
        <ScreenIntro kicker="BANDEJA SOCIAL" title="Tus mensajes" description="Toca una conexión para abrir la conversación y seguir aprendiendo juntos." badge="chat" />
        <EmptyState title="Tus conversaciones aparecerán aquí" text="Cuando ambos acepten una conexión, el chat se activará automáticamente." badge="chat" />
      </section>
    );
  }

  const isMobileConversationOpen = Boolean(currentId);

  return (
    <section className={`screen chat-screen ${isMobileConversationOpen ? 'chat-active-mobile' : 'chat-inbox-mobile'}`}>
      {!isMobileConversationOpen && (
        <ScreenIntro kicker="BANDEJA SOCIAL" title="Tus mensajes" description="Toca una conversación para abrir el chat y seguir aprendiendo juntos." badge="chat" />
      )}

      <div className={`chat-layout ${isMobileConversationOpen ? 'showing-conversation' : 'showing-inbox'}`}>
        {/* Bandeja de conversaciones / Inbox */}
        <aside className="conversation-list">
          <div className="conversation-heading">
            <div>
              <p className="eyebrow">CONVERSACIONES</p>
              <span>{active.length} {active.length === 1 ? 'conexión activa' : 'conexiones activas'}</span>
            </div>
            <i className={realtimeConnected ? 'live-indicator' : 'live-indicator offline'}>
              {realtimeConnected ? 'en vivo' : 'reconectando'}
            </i>
          </div>

          <div className="conversation-search">
            <Icon name="search" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por compañero o tema…"
              aria-label="Buscar conversaciones"
            />
            {searchQuery && (
              <button type="button" className="clear-search" onClick={() => setSearchQuery('')} aria-label="Limpiar búsqueda">×</button>
            )}
          </div>

          <div className="social-rail" aria-label="Contactos recientes">
            {filteredActive.map((item: any, index: number) => (
              <button
                className={item.id === currentId ? 'social-story selected' : 'social-story'}
                key={item.id}
                onClick={() => { clearFile(); setSelectedId(item.id); }}
                aria-label={`Abrir conversación con ${item.counterpart}`}
              >
                <span className={`story-ring story-tone-${index % 4}`}>
                  <span>{initials(item.counterpart)}</span>
                  <i />
                </span>
                <small>{(item.counterpart || 'CM').split(' ')[0]}</small>
              </button>
            ))}
          </div>

          <div className="contact-list" role="list">
            {filteredActive.length ? (
              filteredActive.map((item: any, index: number) => {
                const itemMessages = messagesByConnection[item.id] ?? [];
                const lastMsg = itemMessages[itemMessages.length - 1];
                const snippet = lastMsg
                  ? (lastMsg.text || (lastMsg.attachment ? `📎 ${lastMsg.attachment.fileName}` : 'Archivo adjunto'))
                  : (item.topic || 'Conexión lista para conversar');
                const timeLabel = lastMsg ? formatRelative(lastMsg.createdAt) : 'Nueva conexión';
                const isSelected = item.id === currentId;

                const isItemOnline = Boolean(item.counterpartId && onlineUsers?.has(item.counterpartId));

                return (
                  <button
                    key={item.id}
                    className={`conversation-item ${isSelected ? 'active' : ''}`}
                    onClick={() => { clearFile(); setSelectedId(item.id); }}
                  >
                    <span className="contact-avatar">
                      <span className={`contact-avatar-core story-tone-${index % 4}`}>
                        {initials(item.counterpart)}
                      </span>
                      <i className={`status-dot ${isItemOnline ? 'online' : 'offline'}`} />
                    </span>
                    <span className="contact-copy">
                      <span className="contact-copy-top">
                        <strong>{item.counterpart}</strong>
                        <time>{timeLabel}</time>
                      </span>
                      <small>{snippet}</small>
                      <em>{item.topic}</em>
                    </span>
                    <b aria-hidden="true">›</b>
                  </button>
                );
              })
            ) : (
              <p className="contacts-empty">No se encontraron conversaciones con esa búsqueda.</p>
            )}
          </div>
        </aside>

        {/* Panel de chat / Conversación activa */}
        {current ? (
          <section className="chat-card">
            <header className="chat-card-header">
              <div className="chat-card-header-left">
                <button
                  type="button"
                  className="chat-back-button"
                  onClick={() => { clearFile(); setSelectedId(''); }}
                  aria-label="Volver a la lista de mensajes"
                  title="Volver"
                >
                  <Icon name="back" />
                </button>
                <div className="chat-person">
                  <div className="chat-avatar-wrapper">
                    <span className="chat-avatar">{initials(current?.counterpart)}</span>
                    <i className={`avatar-status-dot ${isCurrentOnline ? 'online' : 'offline'}`} aria-hidden="true" />
                  </div>
                  <div className="chat-person-details">
                    <strong>{current?.counterpart}</strong>
                    <small>
                      <span>{current?.topic}</span>
                      <span className={`presence-text ${isCurrentOnline ? 'online' : 'offline'}`}>
                        {isCurrentOnline ? ' · en línea' : ' · desconectado'}
                      </span>
                    </small>
                  </div>
                </div>
              </div>
              <div className="chat-card-header-right">
                <span className="safe-chat" title="Espacio seguro y monitoreado">
                  <Icon name="shield" /> <span>espacio cuidado</span>
                </span>
                {navigate && (
                  <button
                    type="button"
                    className="chat-quick-agenda-btn"
                    onClick={() => navigate('agenda')}
                    title="Coordinar o revisar sesiones de estudio"
                  >
                    <Icon name="calendar" />
                    <span>Agendar</span>
                  </button>
                )}
              </div>
            </header>

            <div className="messages-scroll" ref={messagesScrollRef} aria-live="polite">
              {messages.length ? (
                messages.map((item: any, index: number) => {
                  const prev = messages[index - 1];
                  const currentDateKey = dominicanDateKey(item.createdAt);
                  const prevDateKey = prev ? dominicanDateKey(prev.createdAt) : null;
                  const showDateDivider = currentDateKey !== prevDateKey;
                  const isSameSenderAsPrev = prev && prev.isMine === item.isMine && !showDateDivider;

                  return (
                    <Fragment key={item.id}>
                      {showDateDivider && (
                        <div className="chat-date-divider" role="separator">
                          <span>{formatChatDayDivider(item.createdAt)}</span>
                        </div>
                      )}
                      <article className={`message-bubble ${item.isMine ? 'mine' : 'theirs'} ${isSameSenderAsPrev ? 'consecutive' : ''}`}>
                        {item.attachment && (
                          item.attachment.contentType?.startsWith('image/')
                            ? <ProtectedChatImage attachment={item.attachment} notify={notify} onImageLoaded={() => scrollToBottom('auto')} />
                            : <button className="document-attachment" onClick={() => openChatAttachment(item.attachment).catch((error: Error) => notify(error.message))}>
                                <span className="document-icon">DOC</span>
                                <span>
                                  <strong>{item.attachment.fileName}</strong>
                                  <small>{formatFileSize(item.attachment.sizeBytes)} · Toca para abrir</small>
                                </span>
                                <b>↓</b>
                              </button>
                        )}
                        {item.text && <MessageText text={item.text} />}
                        <div className="message-meta">
                          <time>{formatDominicanTime(item.createdAt)}</time>
                          {item.isMine && <span className="status-ticks" aria-hidden="true">✓✓</span>}
                        </div>
                      </article>
                    </Fragment>
                  );
                })
              ) : (
                <div className="chat-empty">
                  <IsoBadge kind="chat" large />
                  <h2>Comienza la conversación con {current.counterpart}</h2>
                  <p>Saluda, comparte tu duda sobre <strong>{current.topic}</strong> y acuerden el horario para apoyarse.</p>
                </div>
              )}
              <div ref={messagesEnd} />
            </div>

            <form className="message-composer" onSubmit={send}>
              {selectedFile && (
                <div className="attachment-preview">
                  {previewUrl ? <img src={previewUrl} alt="Vista previa del archivo" /> : <span className="document-icon">DOC</span>}
                  <div className="attachment-info">
                    <strong>{selectedFile.name}</strong>
                    <small>{formatFileSize(selectedFile.size)} · máximo 10 MB</small>
                  </div>
                  <button type="button" className="attachment-remove-btn" onClick={clearFile} aria-label="Quitar archivo">×</button>
                </div>
              )}
              <div className="composer-row">
                <input
                  ref={fileInput}
                  className="file-input"
                  type="file"
                  accept={CHAT_FILE_ACCEPT}
                  onChange={chooseFile}
                  aria-label="Seleccionar imagen o documento"
                />
                <button
                  type="button"
                  className="attach-button"
                  onClick={() => fileInput.current?.click()}
                  aria-label="Adjuntar imagen o documento"
                  title="Adjuntar archivo"
                >
                  ＋
                </button>
                <textarea
                  ref={draftInput}
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onFocus={() => {
                    const runSync = () => {
                      const vv = window.visualViewport;
                      if (vv) {
                        document.documentElement.style.setProperty('--chat-vh', `${Math.round(vv.height)}px`);
                        document.documentElement.style.setProperty('--chat-vt', `${Math.round(vv.offsetTop)}px`);
                      }
                      scrollToBottom('smooth');
                    };
                    requestAnimationFrame(runSync);
                    setTimeout(runSync, 80);
                    setTimeout(runSync, 240);
                    setTimeout(runSync, 420);
                  }}
                  onBlur={() => {
                    const runBlurSync = () => {
                      const vv = window.visualViewport;
                      if (vv) {
                        document.documentElement.style.setProperty('--chat-vh', `${Math.round(vv.height)}px`);
                        document.documentElement.style.setProperty('--chat-vt', `${Math.round(vv.offsetTop)}px`);
                      }
                      if (window.scrollY !== 0) window.scrollTo(0, 0);
                    };
                    requestAnimationFrame(runBlurSync);
                    setTimeout(runBlurSync, 120);
                    setTimeout(runBlurSync, 320);
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      send(event);
                    }
                  }}
                  maxLength={1500}
                  rows={1}
                  placeholder={selectedFile ? 'Agrega un comentario al archivo…' : 'Escribe un mensaje…'}
                  aria-label="Mensaje"
                  enterKeyHint="send"
                />
                <button
                  type="submit"
                  className="send-button"
                  disabled={sending || (!draft.trim() && !selectedFile)}
                  aria-label="Enviar mensaje"
                  title="Enviar"
                >
                  {sending ? '…' : '↗'}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <div className="chat-card chat-card-placeholder">
            <EmptyState
              title="Selecciona una conversación"
              text="Elige un compañero de la lista para ver el historial y enviarse mensajes."
              badge="chat"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function ProtectedChatImage({ attachment, notify, onImageLoaded }: { attachment: any; notify: (message: string) => void; onImageLoaded?: () => void }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let active = true; let objectUrl = ''; const token = localStorage.getItem('conectamente_token'); fetch(`${API}/api/adjuntos/${attachment.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(response => { if (!response.ok) throw new Error(); return response.blob(); }).then(blob => { objectUrl = URL.createObjectURL(blob); if (active) setSrc(objectUrl); }).catch(() => active && notify('No pudimos cargar una imagen del chat.')); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [attachment.id]);
  return <button className="image-attachment" onClick={() => openChatAttachment(attachment).catch((error: Error) => notify(error.message))} aria-label={`Abrir ${attachment.fileName}`}>{src ? <img src={src} alt={attachment.fileName} loading="lazy" onLoad={() => onImageLoaded?.()} /> : <span>Cargando imagen…</span>}</button>;
}

function MessageText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <p>{parts.map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part.includes('meet.google.com') ? 'Abrir Google Meet' : part}</a> : part)}</p>;
}

function NotificationButton({ count, onClick }: { count: number; onClick: () => void }) { return <button className="notification-button" onClick={onClick} aria-label={`Notificaciones, ${count} sin leer`}><Icon name="bell" />{count > 0 && <span>{count > 9 ? '9+' : count}</span>}</button>; }

function NotificationsPanel({ items, onClose, onOpen, onMarkAll }: any) {
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
  return <div className="notifications-backdrop" onClick={onClose}><aside className="notifications-panel" onClick={event => event.stopPropagation()}><div className="notifications-head"><div><p className="eyebrow">ACTIVIDAD</p><h2>Notificaciones</h2></div><button className="close-button" onClick={onClose}>×</button></div>{status === 'idle' && <button className="device-alerts" onClick={enableDeviceAlerts} disabled={requestingPermission || checkingSubscription}><Icon name="bell" /><span><strong>{requestingPermission ? 'Activando avisos…' : checkingSubscription ? 'Comprobando dispositivo…' : devicePermission === 'granted' ? 'Completar activación' : 'Activar avisos del dispositivo'}</strong><small>Recibe alertas aunque la PWA esté cerrada.</small></span><b aria-hidden="true">›</b></button>}{status === 'active' && <div className="device-alerts device-alerts-status active" role="status"><span className="device-status-icon">✓</span><span><strong>Avisos activos en este dispositivo</strong><small>Recibirás solicitudes, mensajes y comentarios incluso con la aplicación cerrada.</small></span></div>}{status === 'blocked' && <div className="device-alerts device-alerts-status blocked" role="alert"><span className="device-status-icon">!</span><span><strong>Avisos bloqueados</strong><small>Actívalos desde los permisos del navegador o del sistema.</small></span></div>}{status === 'unsupported' && <div className="device-alerts device-alerts-status unsupported" role="status"><span className="device-status-icon">i</span><span><strong>Avisos no disponibles</strong><small>En iPhone instala la PWA en la pantalla de inicio y usa iOS 16.4 o superior.</small></span></div>}{permissionMessage && <p className={`permission-feedback ${status}`} role={status === 'blocked' ? 'alert' : 'status'}>{permissionMessage}</p>}{status === 'blocked' && <button className="permission-retry" onClick={enableDeviceAlerts}>Volver a comprobar</button>}<div className="notification-list">{items.length ? items.map((item: any) => <button key={item.id} className={item.isRead ? 'notification-item' : 'notification-item unread'} onClick={() => onOpen(item)}><span className="notification-icon"><Icon name={item.type === 'message' || item.type === 'comment' ? 'message' : item.type === 'session' ? 'calendar' : 'match'} /></span><span><strong>{item.title}</strong><small>{item.body}</small><time>{formatRelative(item.createdAt)}</time></span>{!item.isRead && <i />}</button>) : <EmptyState title="Todo al día" text="Aquí verás solicitudes, mensajes, sesiones y comentarios." badge="network" />}</div>{items.some((item: any) => !item.isRead) && <button className="mark-all" onClick={onMarkAll}>Marcar todo como leído</button>}</aside></div>;
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => { const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); }; document.addEventListener('keydown', handleKeyDown); return () => document.removeEventListener('keydown', handleKeyDown); }, [onCancel]);
  return <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel(); }}><section className="custom-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message"><div className="custom-dialog-head"><span className="dialog-icon"><Icon name="calendar" /></span><button type="button" className="dialog-close" onClick={onCancel} aria-label="Cerrar confirmación">×</button></div><p className="eyebrow">CONFIRMACIÓN</p><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-message">{message}</p><div className="custom-dialog-actions"><button type="button" className="button button-ghost" autoFocus onClick={onCancel}>Cancelar</button><button type="button" className="button button-danger" onClick={onConfirm}>{confirmLabel}</button></div></section></div>;
}

function Agenda({ connections, sessions, setConnections, setSessions, notify }: any) {
  const [form, setForm] = useState({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [meetingSessionId, setMeetingSessionId] = useState<string | null>(null);
  const [ratingSession, setRatingSession] = useState<any | null>(null);
  const [requestPreview, setRequestPreview] = useState<any | null>(null);
  const [requestPreviewLoading, setRequestPreviewLoading] = useState(false);
  const active = connections.filter((item: any) => item.status === 'Activa' || item.status === 1);
  const pending = connections.filter((item: any) => item.requiresMyResponse);
  const upcomingSessions = sessions.filter((item: any) => (item.status === 'Agendada' || item.status === 0) && new Date(item.date).getTime() >= Date.now());
  const historySessions = sessions.filter((item: any) => !upcomingSessions.some((upcoming: any) => upcoming.id === item.id)).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  async function refresh() { const [currentConnections, currentSessions] = await Promise.all([api('/api/conexiones'), api('/api/sesiones')]); setConnections(currentConnections); setSessions(currentSessions); }
  async function respond(id: string, accept: boolean) { try { await api('/api/conexiones/' + id + '/responder', { method: 'POST', body: JSON.stringify({ accept }) }); await refresh(); notify(accept ? 'Conexión aceptada. Ya pueden organizar una sesión.' : 'Invitación rechazada.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos responder la invitación.'); } }
  async function openRequestPreview(id: string) { setRequestPreviewLoading(true); setRequestPreview({ connectionId: id }); try { setRequestPreview(await api('/api/conexiones/' + id + '/solicitante')); } catch (error) { setRequestPreview(null); notify(error instanceof Error ? error.message : 'No pudimos cargar los detalles de esta persona.'); } finally { setRequestPreviewLoading(false); } }
  async function submit(event: FormEvent) { event.preventDefault(); try { const payload = { durationMinutes: Number(form.durationMinutes), date: dominicanFormToIso(form.date, form.hour, form.minute, form.period), mode: form.mode, objective: form.objective.trim() }; if (editingId) await api('/api/sesiones/' + editingId, { method: 'PUT', body: JSON.stringify(payload) }); else await api('/api/conexiones/' + form.connectionId + '/sesiones', { method: 'POST', body: JSON.stringify(payload) }); await refresh(); setEditingId(null); setForm({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' }); notify(editingId ? 'Encuentro actualizado.' : 'Sesión agendada con una guía inicial.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos guardar el encuentro.'); } }
  function editSession(item: any) { const parts = dominicanSessionParts(item.date); setEditingId(item.id); setForm({ connectionId: item.connectionId, date: parts.date, hour: parts.hour, minute: parts.minute, period: parts.period, durationMinutes: item.durationMinutes, mode: item.mode, objective: item.objective }); if (item.meetUrl) notify('Recuerda actualizar también el evento en Google Calendar.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function deleteSession() { if (!pendingDelete) return; const item = pendingDelete; setPendingDelete(null); try { await api('/api/sesiones/' + item.id, { method: 'DELETE' }); await refresh(); if (editingId === item.id) { setEditingId(null); setForm({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' }); } notify('Encuentro eliminado.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos eliminar el encuentro.'); } }
  async function createGoogleMeet(item: any) { setMeetingSessionId(item.id); try { const accessToken = await requestGoogleCalendarAccess(); const result = await api('/api/sesiones/' + item.id + '/google-meet', { method: 'POST', body: JSON.stringify({ accessToken }) }); await refresh(); notify(result.pending ? result.message : 'Google Meet creado y compartido automáticamente en el chat.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos crear Google Meet.'); } finally { setMeetingSessionId(null); } }
  async function completeSession(item: any) { try { await api('/api/sesiones/' + item.id + '/completar', { method: 'POST' }); await refresh(); notify(item.isRequester ? 'Sesión completada. Ya puedes calificar la orientación.' : 'Sesión marcada como completada.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos completar la sesión.'); } }
  const resetForm = () => { setEditingId(null); setForm({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' }); };

  return <>
    <section className="screen">
      <ScreenIntro kicker="COORDINACIÓN" title="Hazle espacio al aprendizaje" description="Propón una sesión breve, con objetivo claro y confirmación de ambas personas." badge="book" />
      {pending.length > 0 && <section className="invitation-strip"><div><p className="eyebrow">INVITACIONES</p><strong>{pending.length} compañero quiere conectar contigo</strong></div>{pending.map((item: any) => <article key={item.id}><IsoBadge kind="network" /><span><b>{item.counterpart}</b><small>{item.topic}</small></span><button className="button button-secondary small" onClick={() => openRequestPreview(item.id)}>Ver perfil</button><button className="button button-primary small" onClick={() => respond(item.id, true)}>Aceptar</button><button className="button button-ghost small" onClick={() => respond(item.id, false)}>Ahora no</button></article>)}</section>}
      <div className="content-grid">
        <form className="surface-card form-surface" onSubmit={submit}>
          <CardHeading number="01" title={editingId ? 'Editar encuentro' : 'Proponer sesión'} text={editingId ? 'Actualiza la fecha, el objetivo o la modalidad.' : 'Elige una conexión activa; sin copiar identificadores.'} />
          {active.length ? <>
            <label>Compañero y tema<select value={form.connectionId} onChange={event => setForm({ ...form, connectionId: event.target.value })} required disabled={Boolean(editingId)}><option value="">Selecciona una conexión</option>{active.map((item: any) => <option key={item.id} value={item.id}>{item.counterpart} · {item.topic}</option>)}</select></label>
            <div className="dominican-date-time"><label>Fecha (DD/MM/AAAA)<input type="text" inputMode="numeric" pattern="(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2])/([0-9]{4})" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} placeholder="16/09/2026" required /></label><label>Hora dominicana<div className="time-selects"><select value={form.hour} onChange={event => setForm({ ...form, hour: event.target.value })} aria-label="Hora" required><option value="">Hora</option>{Array.from({ length: 12 }, (_, index) => index + 1).map(hour => <option key={hour} value={hour}>{hour}</option>)}</select><select value={form.minute} onChange={event => setForm({ ...form, minute: event.target.value })} aria-label="Minutos"><option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option></select><select value={form.period} onChange={event => setForm({ ...form, period: event.target.value })} aria-label="Periodo"><option value="AM">a. m.</option><option value="PM">p. m.</option></select></div></label></div>
            <small className="date-format-hint">Zona horaria de República Dominicana (UTC−4).</small>
            <div className="field-grid"><label>Duración<select value={form.durationMinutes} onChange={event => setForm({ ...form, durationMinutes: Number(event.target.value) })}><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option></select></label><label>Modalidad<select value={form.mode} onChange={event => setForm({ ...form, mode: event.target.value })}><option value="virtual">Virtual</option><option value="presencial">Presencial</option></select></label></div>
            <label>Objetivo<input value={form.objective} onChange={event => setForm({ ...form, objective: event.target.value })} placeholder="¿Qué quieren conseguir al terminar?" required maxLength={300} /></label>
            <div className="form-actions"><button className="button button-primary">{editingId ? 'Guardar cambios' : 'Agendar sesión'}</button>{editingId && <button type="button" className="button button-ghost" onClick={resetForm}>Cancelar</button>}</div>
          </> : <EmptyState title="Primero crea una conexión" text="Acepta una coincidencia y espera la confirmación del compañero para poder agendar." badge="network" />}
        </form>
        <section className="timeline-card">
          <CardHeading number="02" title="Próximos encuentros" text={`${upcomingSessions.length} ${upcomingSessions.length === 1 ? 'encuentro próximo' : 'encuentros próximos'}`} />
          {upcomingSessions.length ? <div className="session-list">{upcomingSessions.map((item: any) => <article key={item.id}><div className="session-date"><strong>{formatDominicanDate(item.date)}</strong><span>{formatDominicanTime(item.date)}</span></div><div className="session-info"><b>{item.objective}</b><p>{formatDominicanDateLong(item.date)} · {item.durationMinutes} min · {item.mode}</p><small>{connections.find((connection: any) => connection.id === item.connectionId)?.counterpart ?? 'Conexión de aprendizaje'}</small></div><span className="status-pill">{humanStatus(item.status)}</span><div className="session-actions">{String(item.mode).toLowerCase() === 'virtual' && (item.meetUrl ? <a className="button meet-button small" href={item.meetUrl} target="_blank" rel="noreferrer">Entrar a Meet</a> : <button type="button" className="button meet-button small" disabled={meetingSessionId === item.id} onClick={() => createGoogleMeet(item)}>{meetingSessionId === item.id ? 'Creando…' : 'Crear Google Meet'}</button>)}<button type="button" className="button button-secondary small" onClick={() => editSession(item)}>Editar</button><button type="button" className="button button-danger small" onClick={() => setPendingDelete(item)}>Eliminar</button></div></article>)}</div> : <ol className="timeline"><li><span>1</span><div><strong>Elige a tu compañero</strong><p>Solo aparecen conexiones confirmadas.</p></div></li><li><span>2</span><div><strong>Define un objetivo</strong><p>Una meta pequeña y concreta.</p></div></li><li><span>3</span><div><strong>Recibe una guía</strong><p>Pasos sugeridos para enfocarse.</p></div></li></ol>}
        </section>
      </div>
      <section className="session-history surface-card"><div className="section-heading compact"><div><p className="eyebrow">EXPERIENCIAS COMPARTIDAS</p><h2>Historial y valoraciones</h2></div><span className="count-badge">{historySessions.length}</span></div>{historySessions.length ? <div className="history-list">{historySessions.map((item: any) => { const scheduled = item.status === 'Agendada' || item.status === 0; const completed = item.status === 'Completada' || item.status === 1; return <article key={item.id}><span className="history-icon"><Icon name={completed ? 'star' : 'calendar'} /></span><span className="history-copy"><strong>{item.topic || item.objective}</strong><small>{item.counterpart || 'Conexión de aprendizaje'} · {formatDominicanDateTimeCompact(item.date)}</small><em>{completed ? 'Orientación completada' : humanStatus(item.status)}</em></span><span className="history-actions">{scheduled && new Date(item.date).getTime() < Date.now() && <button className="button button-secondary small" onClick={() => completeSession(item)}>Marcar completada</button>}{completed && item.canRate && <button className="button button-primary small" onClick={() => setRatingSession(item)}>Calificar orientación</button>}{completed && item.hasRated && <span className="rated-pill">★ Valorada</span>}{completed && !item.isRequester && <span className="rated-pill neutral">Orientación impartida</span>}</span></article>; })}</div> : <p className="history-empty">Aquí aparecerán las sesiones pasadas y las calificaciones pendientes.</p>}</section>
    </section>
    {pendingDelete && <ConfirmDialog title="¿Eliminar este encuentro?" message={`Se quitará de tu agenda: “${pendingDelete.objective}”.${pendingDelete.meetUrl ? ' El evento de Google Calendar debe eliminarse también desde Google.' : ''} Esta acción no se puede deshacer.`} confirmLabel="Eliminar encuentro" onConfirm={deleteSession} onCancel={() => setPendingDelete(null)} />}
    {requestPreview && <RequestPreviewDialog data={requestPreview} loading={requestPreviewLoading} onClose={() => setRequestPreview(null)} onRespond={async accept => { await respond(requestPreview.connectionId, accept); setRequestPreview(null); }} />}
    {ratingSession && <RatingDialog session={ratingSession} onCancel={() => setRatingSession(null)} onSaved={async () => { setRatingSession(null); await refresh(); notify('Gracias. Tu valoración ya forma parte de la reputación del colaborador.'); }} />}
  </>;
}

function RequestPreviewDialog({ data, loading, onClose, onRespond }: { data: any; loading: boolean; onClose: () => void; onRespond: (accept: boolean) => Promise<void> }) {
  const [responding, setResponding] = useState(false);
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !responding) onClose(); }; document.addEventListener('keydown', closeOnEscape); return () => document.removeEventListener('keydown', closeOnEscape); }, [onClose, responding]);
  async function respond(accept: boolean) { setResponding(true); await onRespond(accept); setResponding(false); }
  const person = data.person;
  return <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !responding) onClose(); }}><section className="custom-dialog request-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="request-preview-title" aria-describedby="request-preview-description"><div className="custom-dialog-head"><span className="dialog-icon"><Icon name="match" /></span><button type="button" className="dialog-close" onClick={onClose} disabled={responding} aria-label="Cerrar detalles">×</button></div>{loading || !person ? <div className="preview-loading" role="status"><span /><span /><span /><p>Cargando la presentación de esta persona…</p></div> : <><div className="request-preview-person"><div className="request-preview-avatar"><ProfileAvatar userId={person.id} name={person.displayName} version={person.avatarUpdatedAt} /></div><div><p className="eyebrow">SOLICITUD DE CONEXIÓN</p><h2 id="request-preview-title">{person.displayName}</h2><p>{person.career} · {person.academicTerm}</p></div></div><div className="request-preview-request" id="request-preview-description"><span className="soft-label">QUIERE APRENDER SOBRE</span><h3>{data.request.topic}</h3><p>{data.request.description}</p>{data.request.desiredSchedule && <small>Disponibilidad indicada: {data.request.desiredSchedule}</small>}</div><div className="request-preview-grid"><div><span className="eyebrow">TEMAS COMPARTIDOS</span>{data.skills?.length ? <div className="preview-chips">{data.skills.map((skill: any) => <span key={skill.topic}>{skill.topic}</span>)}</div> : <p>Esta persona todavía no ha compartido temas.</p>}</div><div><span className="eyebrow">EXPERIENCIA</span><strong className="preview-rating">{data.reputation?.totalRatings ? `★ ${Number(data.reputation.average).toFixed(1)}` : 'Nueva conexión'}</strong><small>{data.reputation?.totalRatings ? `${data.reputation.totalRatings} valoraciones recibidas` : 'Aún no tiene valoraciones'}</small></div></div><p className="preview-note"><Icon name="shield" /> Solo mostramos información que la persona decidió compartir.</p><div className="custom-dialog-actions"><button type="button" className="button button-ghost" onClick={() => respond(false)} disabled={responding}>Ahora no</button><button type="button" className="button button-primary" onClick={() => respond(true)} disabled={responding}>{responding ? 'Procesando…' : 'Aceptar conexión'}</button></div></>}</section></div>;
}

function RatingDialog({ session, onCancel, onSaved }: { session: any; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ usefulness: 5, clarity: 5, fulfillment: 5, respect: 5, comment: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onCancel(); }; document.addEventListener('keydown', handleKeyDown); return () => document.removeEventListener('keydown', handleKeyDown); }, [onCancel, saving]);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(''); try { await api('/api/sesiones/' + session.id + '/valoraciones', { method: 'POST', body: JSON.stringify(form) }); await onSaved(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos guardar tu valoración.'); } finally { setSaving(false); } }
  return <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !saving) onCancel(); }}><section className="custom-dialog rating-dialog" role="dialog" aria-modal="true" aria-labelledby="rating-dialog-title"><div className="custom-dialog-head"><span className="dialog-icon star"><Icon name="star" /></span><button type="button" className="dialog-close" onClick={onCancel} disabled={saving} aria-label="Cerrar valoración">×</button></div><p className="eyebrow">VALORAR ORIENTACIÓN</p><h2 id="rating-dialog-title">¿Cómo fue aprender con {session.counterpart}?</h2><p>Tu opinión se mostrará en su reputación para <strong>{session.topic}</strong>. Evalúa la experiencia académica, no características personales.</p><form onSubmit={submit}><StarRating label="Utilidad" help="¿Te ayudó a avanzar?" value={form.usefulness} onChange={value => setForm({ ...form, usefulness: value })} /><StarRating label="Claridad" help="¿Explicó de forma comprensible?" value={form.clarity} onChange={value => setForm({ ...form, clarity: value })} /><StarRating label="Cumplimiento" help="¿Respetó lo acordado?" value={form.fulfillment} onChange={value => setForm({ ...form, fulfillment: value })} /><StarRating label="Respeto" help="¿Fue una experiencia cuidadosa?" value={form.respect} onChange={value => setForm({ ...form, respect: value })} /><label>Comentario académico <span className="optional-label">opcional</span><textarea value={form.comment} onChange={event => setForm({ ...form, comment: event.target.value })} maxLength={500} placeholder="Ej. Explicó los ejercicios paso a paso y comprobó que entendiera." /></label>{error && <p className="inline-message" role="alert">{error}</p>}<div className="custom-dialog-actions"><button type="button" className="button button-ghost" onClick={onCancel} disabled={saving}>Ahora no</button><button className="button button-primary" disabled={saving}>{saving ? 'Guardando…' : 'Publicar valoración'}</button></div></form></section></div>;
}

function StarRating({ label, help, value, onChange }: { label: string; help: string; value: number; onChange: (value: number) => void }) { return <fieldset className="star-rating"><legend><strong>{label}</strong><small>{help}</small></legend><div role="radiogroup" aria-label={label}>{[1,2,3,4,5].map(star => <button type="button" role="radio" aria-checked={value === star} aria-label={`${star} ${star === 1 ? 'estrella' : 'estrellas'}`} className={star <= value ? 'selected' : ''} key={star} onClick={() => onChange(star)}>★</button>)}</div><b>{value}/5</b></fieldset>; }

function Security({ connections, notify }: any) {
  const [form, setForm] = useState({ reportedUserId: '', referenceId: '', reason: '', description: '' });
  async function submit(event: FormEvent) { event.preventDefault(); try { await api('/api/reportes', { method: 'POST', body: JSON.stringify(form) }); setForm({ reportedUserId: '', referenceId: '', reason: '', description: '' }); notify('Reporte recibido. Un moderador humano lo revisará.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos enviar el reporte.'); } }
  function chooseConnection(id: string) { const item = connections.find((connection: any) => connection.id === id); setForm({ ...form, referenceId: id, reportedUserId: item?.counterpartId ?? '' }); }
  return <section className="screen"><ScreenIntro kicker="CONFIANZA Y CUIDADO" title="Siempre hay una persona detrás" description="Los reportes los revisa un moderador humano. La IA nunca decide sanciones." badge="chat" /><div className="safety-banner"><IsoBadge kind="network" /><div><strong>Tu seguridad va primero</strong><p>Bloquear tiene efecto inmediato. Reportar inicia una revisión privada y humana.</p></div></div><form className="surface-card form-surface report-form" onSubmit={submit}>{connections.length ? <><label>¿Sobre qué conexión quieres informar?<select value={form.referenceId} onChange={event => chooseConnection(event.target.value)} required><option value="">Selecciona una conexión</option>{connections.map((item: any) => <option key={item.id} value={item.id}>{item.counterpart} · {item.topic}</option>)}</select></label><label>Motivo<select value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} required><option value="">Selecciona una opción</option><option value="conducta">Conducta inapropiada</option><option value="integridad">Integridad académica</option><option value="privacidad">Privacidad</option><option value="otro">Otro motivo</option></select></label><label>Cuéntanos qué ocurrió<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Describe los hechos con el detalle que consideres necesario." required /></label><div className="form-footer"><p>Solo el equipo de moderación podrá consultar este reporte.</p><button className="button button-danger">Enviar a revisión humana</button></div></> : <EmptyState title="No tienes conexiones que reportar" text="Este espacio se activará cuando hayas conectado con otro estudiante." badge="network" />}</form></section>;
}

function AdminPanel({ notify }: { notify: (message: string) => void }) {
  const [summary, setSummary] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ user: any; status: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (status) query.set('status', status);
      const [nextSummary, nextUsers] = await Promise.all([api('/api/admin/resumen'), api('/api/admin/usuarios?' + query.toString())]);
      setSummary(nextSummary); setUsers(nextUsers);
    } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos cargar la administración.'); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, [status]);
  async function saveStatus(reason: string) {
    if (!pending) return;
    try { await api('/api/admin/usuarios/' + pending.user.id + '/estado', { method: 'POST', body: JSON.stringify({ status: pending.status, reason }) }); setPending(null); await refresh(); notify('Estado de la cuenta actualizado.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'No pudimos actualizar la cuenta.'); }
  }
  return <section className="screen admin-screen"><ScreenIntro kicker="CONTROL DEL SISTEMA" title="Tu comunidad, bajo control" description="Gestiona accesos con trazabilidad, contexto y el mismo cuidado que esperamos en cada conexión." badge="network" /><div className="admin-guard"><span className="admin-guard-icon"><Icon name="shield" /></span><div><strong>Sesión de superadministrador</strong><p>Solo este rol puede cambiar el acceso de otras cuentas.</p></div><span className="status-pill active">Protegido</span></div><div className="admin-metrics">{[['Usuarios registrados', summary?.total ?? '—', 'total'], ['Activos', summary?.activos ?? '—', 'active'], ['Suspendidos', summary?.suspendidos ?? '—', 'suspended'], ['Bloqueados', summary?.bloqueados ?? '—', 'blocked']].map(([label, value, key]) => <button key={String(key)} className="admin-metric" onClick={() => setStatus(key === 'total' ? '' : String(key))}><span>{label}</span><strong>{value}</strong><small>{key === 'total' ? `${summary?.nuevosUltimos30Dias ?? 0} nuevos en 30 días` : 'Ver cuentas'}</small></button>)}</div><section className="surface-card admin-users-card"><div className="section-heading compact"><div><p className="eyebrow">DIRECTORIO</p><h2>Personas registradas</h2><p>Busca por nombre, correo o carrera. Las restricciones siempre llevan un motivo visible al iniciar sesión.</p></div><span className="count-badge">{users.length}</span></div><form className="admin-filters" onSubmit={event => { event.preventDefault(); refresh(); }}><label className="search-field"><Icon name="search" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar usuario…" aria-label="Buscar usuario" /></label><select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value="active">Activos</option><option value="suspended">Suspendidos</option><option value="blocked">Bloqueados</option></select><button className="button button-primary small">Buscar</button></form>{loading ? <p className="history-empty">Cargando directorio…</p> : users.length ? <div className="admin-user-list">{users.map(user => <article className="admin-user-row" key={user.id}><span className="admin-avatar">{initials(user.displayName)}</span><div className="admin-user-copy"><strong>{user.displayName}</strong><span>{user.email}</span><small>{user.career} · {user.academicTerm}</small>{user.accessStatusReason && <em>Motivo: {user.accessStatusReason}</em>}</div><span className={`status-pill ${user.accessStatus}`}>{adminStatusLabel(user.accessStatus)}</span><div className="admin-user-actions">{user.accessStatus !== 'active' && <button className="button button-secondary small" onClick={() => setPending({ user, status: 'active' })}>Reactivar</button>}{user.accessStatus !== 'suspended' && <button className="button button-secondary small" onClick={() => setPending({ user, status: 'suspended' })}>Suspender</button>}{user.accessStatus !== 'blocked' && <button className="button button-danger small" onClick={() => setPending({ user, status: 'blocked' })}>Bloquear</button>}</div></article>)}</div> : <EmptyState title="No encontramos cuentas" text="Prueba con otro nombre, correo o filtro." badge="network" />}</section>{pending && <AdminAccessDialog user={pending.user} status={pending.status} onCancel={() => setPending(null)} onSave={saveStatus} />}</section>;
}

function AdminAccessDialog({ user, status, onCancel, onSave }: { user: any; status: string; onCancel: () => void; onSave: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState(''); const [saving, setSaving] = useState(false); const requiresReason = status !== 'active';
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onCancel(); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [onCancel, saving]);
  async function submit(event: FormEvent) { event.preventDefault(); if (requiresReason && !reason.trim()) return; setSaving(true); try { await onSave(reason); } finally { setSaving(false); } }
  const action = status === 'blocked' ? 'bloquear' : status === 'suspended' ? 'suspender' : 'reactivar';
  return <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !saving) onCancel(); }}><section className="custom-dialog admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title"><div className="custom-dialog-head"><span className={`dialog-icon ${status}`}><Icon name="shield" /></span><button type="button" className="dialog-close" onClick={onCancel} disabled={saving} aria-label="Cerrar">×</button></div><p className="eyebrow">GESTIÓN DE ACCESO</p><h2 id="admin-dialog-title">¿Quieres {action} esta cuenta?</h2><p><strong>{user.displayName}</strong> · {user.email}</p>{requiresReason ? <label>Motivo de la decisión<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required placeholder="Explica de forma clara qué ocurrió y qué debe saber la persona." /><small>{reason.length}/500 · Este mensaje aparecerá al intentar iniciar sesión.</small></label> : <p className="dialog-note">La persona podrá volver a iniciar sesión. Su motivo anterior quedará retirado.</p>}<div className="custom-dialog-actions"><button type="button" className="button button-ghost" onClick={onCancel} disabled={saving}>Cancelar</button><button className={status === 'blocked' ? 'button button-danger' : 'button button-primary'} disabled={saving || (requiresReason && !reason.trim())}>{saving ? 'Guardando…' : `Confirmar ${action}`}</button></div></section></div>;
}

function adminStatusLabel(status: string) { return status === 'blocked' ? 'Bloqueado' : status === 'suspended' ? 'Suspendido' : 'Activo'; }

function InstitutionalPanel() {
  const topics = [{ name: 'Cálculo', value: 84 }, { name: 'Programación', value: 68 }, { name: 'Estadística', value: 52 }, { name: 'Bases de datos', value: 41 }];
  return <section className="screen"><ScreenIntro kicker="VISIÓN INSTITUCIONAL" title="Tendencias sin exponer personas" description="Métricas agregadas para orientar recursos académicos con privacidad." badge="network" /><div className="panel-metrics"><article><span>Demanda atendida</span><strong>72%</strong><small>+8% este periodo</small></article><article><span>Solicitudes activas</span><strong>148</strong><small>Datos agregados</small></article><article><span>Participación</span><strong>64%</strong><small>Aprenden y colaboran</small></article></div><div className="content-grid panel-grid"><section className="surface-card"><div className="section-heading compact"><div><p className="eyebrow">DEMANDA</p><h2>Temas más solicitados</h2></div><select aria-label="Periodo"><option>Periodo actual</option></select></div><div className="bar-chart">{topics.map(topic => <div className="bar-row" key={topic.name}><span>{topic.name}</span><div><i style={{ width: topic.value + '%' }} /></div><strong>{topic.value}</strong></div>)}</div></section><section className="privacy-panel"><IsoBadge kind="network" /><p className="eyebrow">PRIVACIDAD</p><h2>Lo que este panel no muestra</h2><ul><li>Identidades de estudiantes</li><li>Conversaciones privadas</li><li>Valoraciones individuales</li></ul><p>Las categorías pequeñas se agrupan para evitar inferencias.</p></section></div></section>;
}

function ScreenIntro({ kicker, title, description, badge }: { kicker: string; title: string; description: string; badge: 'book' | 'chat' | 'network' }) { return <header className="screen-intro"><div><p className="eyebrow">{kicker}</p><h1>{title}</h1><p>{description}</p></div><IsoBadge kind={badge} large /></header>; }
function CardHeading({ number, title, text }: { number: string; title: string; text: string }) { return <div className="card-heading"><div><span className="step-number">{number}</span><div><h2>{title}</h2><p>{text}</p></div></div></div>; }
function ActionCard({ badge, title, text, onClick }: { badge: 'book' | 'chat' | 'network'; title: string; text: string; onClick: () => void }) { return <button className="action-card" onClick={onClick}><IsoBadge kind={badge} /><span><strong>{title}</strong><small>{text}</small></span><b>→</b></button>; }
function EmptyState({ title, text, badge }: { title: string; text: string; badge: 'book' | 'chat' | 'network' }) { return <section className="empty-state"><IsoBadge kind={badge} large /><h2>{title}</h2><p>{text}</p></section>; }
function Brand({ large = false, light = false }: { large?: boolean; light?: boolean }) { return <div className={`${large ? 'brand brand-large' : 'brand'}${light ? ' brand-light' : ''}`} aria-label="ConectaMentes IA"><span>Conecta</span>Mentes <em>IA</em></div>; }
function ProfileAvatar({ userId, name, version, className = 'profile-avatar' }: { userId?: string; name?: string; version?: string; className?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!userId) { setSrc(''); return; }
    let active = true;
    let objectUrl = '';
    const token = localStorage.getItem('conectamente_token');
    fetch(`${API}/api/usuarios/${userId}/avatar?v=${encodeURIComponent(version ?? Date.now().toString())}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(response => response.ok ? response.blob() : null)
      .then(blob => { if (!active || !blob) return; objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); })
      .catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [userId, version]);
  return src ? <img className={className} src={src} alt={`Foto de ${name ?? 'perfil'}`} /> : <span className={`${className} avatar-fallback`}>{initials(name)}</span>;
}
function IsoBadge({ kind, large = false }: { kind: 'book' | 'chat' | 'network'; large?: boolean }) { return <span className={`iso-badge iso-${kind}${large ? ' iso-large' : ''}`} aria-hidden="true" />; }
function NavButton({ item, active, onClick }: { item: { id: Tab; label: string; icon: IconName }; active: boolean; onClick: () => void }) { return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}><Icon name={item.icon} /><span>{item.label}</span></button>; }

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = { home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6', profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0', request: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h3', match: 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a4 4 0 1 0 0-8M2 20a6 6 0 0 1 12 0m-2-3a6 6 0 0 1 10 3', message: 'M4 5h16v11H8l-4 4V5Zm4 5h8m-8 3h5', bell: 'M6 17h12l-2-3V9a4 4 0 0 0-8 0v5l-2 3Zm4 3h4', search: 'm21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', calendar: 'M4 7h16v13H4zM8 3v4m8-4v4M4 11h16m-5 3-3 3-2-2', shield: 'M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Zm-3 9 2 2 4-4', chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2', star: 'm12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6-4.36-4.25 6.03-.88L12 3Z', more: 'M5 12h.01M12 12h.01M19 12h.01', back: 'M19 12H5m7 7-7-7 7-7' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function initials(name?: string) { return (name || 'CM').split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function humanStatus(status: unknown) { return String(status ?? 'abierta').replaceAll('_', ' ').replace(/^./, value => value.toUpperCase()); }
function mergeMessage(items: any[], item: any) { return items.some(current => current.id === item.id) ? items : [...items, item]; }
function formatDominicanTime(value: string | Date) { return new Intl.DateTimeFormat(DO_LOCALE, { timeZone: DO_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)); }
function formatDominicanDate(value: string | Date) { return new Intl.DateTimeFormat(DO_LOCALE, { timeZone: DO_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
function formatDominicanDateLong(value: string | Date) { return new Intl.DateTimeFormat(DO_LOCALE, { timeZone: DO_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)); }
function formatDominicanDateTimeCompact(value: string | Date) { return `${formatDominicanNumericDate(value)} · ${formatDominicanTime(value)}`; }
function formatChatDayDivider(value: string | Date) { const date = new Date(value); const today = new Date(); const yesterday = new Date(today.getTime() - 86_400_000); const key = dominicanDateKey(date); if (key === dominicanDateKey(today)) return 'Hoy'; if (key === dominicanDateKey(yesterday)) return 'Ayer'; return formatDominicanDate(date); }
function formatFileSize(value: number) { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`; }
function formatDominicanNumericDate(value: string | Date) { return new Intl.DateTimeFormat(DO_LOCALE, { timeZone: DO_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)); }
function dominicanSessionParts(value: string | Date) { const parts = new Intl.DateTimeFormat('en-US', { timeZone: DO_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(value)); const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''; return { date: `${get('day')}/${get('month')}/${get('year')}`, hour: get('hour'), minute: get('minute'), period: get('dayPeriod') === 'PM' ? 'PM' : 'AM' }; }
function dominicanDateKey(value: string | Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: DO_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
function formatRelative(value: string) { const date = new Date(value); const today = new Date(); const yesterday = new Date(today.getTime() - 86_400_000); const key = dominicanDateKey(date); if (key === dominicanDateKey(today)) return `Hoy, ${formatDominicanTime(date)}`; if (key === dominicanDateKey(yesterday)) return `Ayer, ${formatDominicanTime(date)}`; return formatDominicanDateTimeCompact(date); }
function dominicanFormToIso(date: string, hour: string, minute: string, period: string) { const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date); if (!match) throw new Error('Escribe la fecha en formato DD/MM/AAAA.'); const [, day, month, year] = match; const twelveHour = Number(hour); if (twelveHour < 1 || twelveHour > 12) throw new Error('Selecciona una hora válida.'); const twentyFourHour = (twelveHour % 12) + (period === 'PM' ? 12 : 0); const candidate = new Date(`${year}-${month}-${day}T12:00:00-04:00`); if (Number.isNaN(candidate.getTime()) || formatDominicanNumericDate(candidate) !== `${day}/${month}/${year}`) throw new Error('La fecha indicada no es válida.'); return `${year}-${month}-${day}T${String(twentyFourHour).padStart(2, '0')}:${minute}:00-04:00`; }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
