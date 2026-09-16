import { ChangeEvent, CSSProperties, FormEvent, StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import './styles.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;
const CHAT_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.txt';
const DO_LOCALE = 'es-DO';
const DO_TIME_ZONE = 'America/Santo_Domingo';
type Mode = 'welcome' | 'login' | 'register' | 'recover';
type Tab = 'inicio' | 'perfil' | 'solicitudes' | 'coincidencias' | 'mensajes' | 'ranking' | 'agenda' | 'seguridad' | 'panel' | 'admin';
type IconName = 'home' | 'profile' | 'request' | 'match' | 'message' | 'bell' | 'search' | 'calendar' | 'shield' | 'chart' | 'star' | 'more';

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
      if ('Notification' in window && window.Notification.permission === 'granted') new window.Notification(item.title, { body: item.body, icon: '/icons/icon-192.png' });
    });
    realtime.on('ChatMessageReceived', item => setMessagesByConnection(current => ({ ...current, [item.connectionId]: mergeMessage(current[item.connectionId] ?? [], { ...item, isMine: item.senderId === me?.id }) })));
    realtime.onreconnecting(() => setRealtimeConnected(false));
    realtime.onreconnected(() => setRealtimeConnected(true));
    realtime.onclose(() => setRealtimeConnected(false));
    realtime.start().then(() => setRealtimeConnected(true)).catch(() => setRealtimeConnected(false));
    return () => { realtime.stop(); };
  }, [logged, me?.id]);
  function showError(error: unknown) { if (error instanceof Error && error.message === 'Tu sesión ha expirado.') { localStorage.removeItem('conectamente_token'); setMe(null); setLogged(false); setMode('login'); setTab('inicio'); setNotice(error.message); return; } setNotice(error instanceof Error ? error.message : 'Ocurrió un error.'); }
  function signOut() { localStorage.removeItem('conectamente_token'); setMe(null); setLogged(false); setMode('welcome'); setTab('inicio'); }

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

  if (!logged) return <><Welcome mode={mode} setMode={setMode} notice={notice} busy={busy} submit={authSubmit} googleLogin={googleLogin} /><UpdatePrompt {...pwaUpdate} /></>;

  return <><div className="app-layout">
    <aside className="sidebar"><Brand /><nav className="side-nav" aria-label="Navegación principal">{availableNavItems.map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />)}</nav><div className="sidebar-note"><IsoBadge kind="network" /><p>Conexiones cuidadas, aprendizaje compartido.</p></div></aside>
    <main className="app-main">
      <header className="mobile-header"><Brand /><div className="header-actions"><NotificationButton count={unreadCount} onClick={() => setShowNotifications(true)} /><button className="avatar-button" aria-label="Abrir perfil" onClick={() => navigate('perfil')}>{initials(me?.displayName)}</button></div></header>
      <header className="desktop-topbar"><div><span className={realtimeConnected ? 'presence-dot' : 'presence-dot offline'} />{realtimeConnected ? 'Comunidad conectada' : 'Reconectando…'}</div><div className="user-menu"><NotificationButton count={unreadCount} onClick={() => setShowNotifications(true)} /><span>{me?.displayName ?? 'Estudiante'}</span><button className="avatar-button" onClick={() => navigate('perfil')}>{initials(me?.displayName)}</button><button className="logout" onClick={signOut}>Salir</button></div></header>
      <div className="screen-content">
        {notice && <div className="toast" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Cerrar mensaje">×</button></div>}
        {tab === 'inicio' && <Home me={me} profile={profile} requests={requests} connections={connections} navigate={navigate} />}
        {tab === 'perfil' && <Profile profile={profile} setProfile={setProfile} notify={setNotice} userId={me?.id} />}
        {tab === 'solicitudes' && <Requests requests={requests} form={requestForm} setForm={setRequestForm} submit={createRequest} calculate={calculate} />}
        {tab === 'coincidencias' && <ConnectionsExplorer matches={matches} requestId={selectedRequest} notify={setNotice} onRequestTopic={(topic: string) => { setRequestForm({ ...requestForm, topic, description: `Quiero encontrar una persona para aprender sobre ${topic}.`, helpType: 'comprender', desiredSchedule: '' }); navigate('solicitudes'); }} />}
        {tab === 'mensajes' && <Messages connections={connections} selectedId={chatConnectionId} setSelectedId={setChatConnectionId} messagesByConnection={messagesByConnection} setMessagesByConnection={setMessagesByConnection} realtimeConnected={realtimeConnected} notify={setNotice} />}
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
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null; let interval = 0; let reloading = false;
    const revealUpdate = () => { if (registration?.waiting) setWaitingWorker(registration.waiting); };
    const updateFound = () => { const worker = registration?.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) revealUpdate(); }); };
    const controllerChanged = () => { if (reloading) return; reloading = true; location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    navigator.serviceWorker.register('/sw.js').then(current => { registration = current; revealUpdate(); current.addEventListener('updatefound', updateFound); current.update().then(revealUpdate).catch(() => undefined); interval = window.setInterval(() => current.update(), 5 * 60 * 1000); }).catch(() => undefined);
    return () => { if (interval) window.clearInterval(interval); registration?.removeEventListener('updatefound', updateFound); navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged); };
  }, []);
  function applyUpdate() { if (!waitingWorker) return; setUpdating(true); waitingWorker.postMessage({ type: 'SKIP_WAITING' }); }
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

function Profile({ profile, setProfile, notify, userId }: any) {
  const [skill, setSkill] = useState({ topic: '', type: 'Domina', confidence: 4, visible: true });
  const [reputation, setReputation] = useState<any>(null);
  useEffect(() => { if (userId) api('/api/usuarios/' + userId + '/reputacion').then(setReputation).catch(() => undefined); }, [userId]);
  async function add(event: FormEvent) { event.preventDefault(); try { await api('/api/perfil/habilidades', { method: 'POST', body: JSON.stringify({ ...skill, confidence: Number(skill.confidence) }) }); setProfile(await api('/api/perfil')); setSkill({ ...skill, topic: '' }); notify('Tema agregado a tu perfil.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos guardar el tema.'); } }
  return <section className="screen"><ScreenIntro kicker="MI APRENDIZAJE" title="Tu perfil, a tu manera" description="Elige qué temas compartir. Tú controlas qué información se muestra a otros estudiantes." badge="book" />{reputation && <ReputationSummary reputation={reputation} title="Mi reputación como colaborador" /> }<div className="content-grid"><form className="surface-card form-surface" onSubmit={add}><CardHeading number="01" title="Agregar un tema" text="Cuéntanos qué sabes o qué quieres aprender." /><label>Tema<input value={skill.topic} onChange={event => setSkill({ ...skill, topic: event.target.value })} placeholder="Ej. Bases de datos" required /></label><div className="two-columns"><label>Mi relación con el tema<select value={skill.type} onChange={event => setSkill({ ...skill, type: event.target.value })}><option value="Domina">Puedo ayudar</option><option value="NecesitaApoyo">Necesito apoyo</option></select></label><label>Confianza <span className="range-value">{skill.confidence}/5</span><input type="range" min="1" max="5" value={skill.confidence} onChange={event => setSkill({ ...skill, confidence: Number(event.target.value) })} /></label></div><button className="button button-primary">Agregar a mi perfil</button></form><section className="surface-card"><CardHeading number="02" title="Mi mapa actual" text={`${profile.habilidades?.length ?? 0} temas agregados`} /><div className="skill-list">{profile.habilidades?.length ? profile.habilidades.map((item: any) => <article className="skill-row" key={item.id}><IsoBadge kind={item.type === 'Domina' || item.type === 0 ? 'book' : 'chat'} /><div><strong>{item.topic}</strong><span>{item.type === 'Domina' || item.type === 0 ? 'Puedo ayudar' : 'Necesito apoyo'}</span></div><span className="confidence">{item.confidence ?? 4}/5</span></article>) : <EmptyState title="Tu mapa comienza aquí" text="Agrega tu primer tema para personalizar tus conexiones." badge="book" />}</div></section></div></section>;
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

function Requests({ requests, form, setForm, submit, calculate }: any) {
  return <section className="screen"><ScreenIntro kicker="PEDIR APOYO" title="Cuéntanos qué necesitas" description="Elige una opción y escribe con tus propias palabras. La comunidad te ayudará a encontrar el mejor camino." badge="chat" /><div className="content-grid requests-grid"><form className="surface-card form-surface" onSubmit={submit}><CardHeading number="01" title="Nueva solicitud" text="No tienes que usar palabras técnicas." /><label>¿Sobre qué tema necesitas apoyo?<input value={form.topic} onChange={event => setForm({ ...form, topic: event.target.value })} placeholder="Ej. Integrales, programación, inglés…" required /></label><label>¿Qué quieres lograr?<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Describe en una o dos frases qué quieres comprender, practicar o preparar." required /></label><div className="two-columns"><label>¿Qué tipo de apoyo buscas?<select value={form.helpType} onChange={event => setForm({ ...form, helpType: event.target.value })}><optgroup label="Comprender y aprender"><option value="comprender">Comprender un concepto</option><option value="desde_cero">Aprender desde cero</option><option value="teoria_practica">Conectar teoría con práctica</option><option value="material">Encontrar materiales de estudio</option></optgroup><optgroup label="Practicar y prepararme"><option value="practicar">Practicar ejercicios</option><option value="examen">Prepararme para un examen</option><option value="exposicion">Preparar una exposición</option><option value="plan">Organizar un plan de estudio</option></optgroup><optgroup label="Revisar mi avance"><option value="revisar">Revisar mi razonamiento</option><option value="retroalimentacion">Recibir retroalimentación</option><option value="proyecto">Orientar un proyecto</option></optgroup></select></label><label>¿Cuándo te vendría bien? <span className="optional-label">opcional</span><input value={form.desiredSchedule} onChange={event => setForm({ ...form, desiredSchedule: event.target.value })} placeholder="Ej. tardes o sábados" /></label></div><div className="request-tip"><IsoBadge kind="book" /><span><strong>Hazlo simple</strong><small>No hace falta que conozcas el nombre exacto del tema. La comunidad te ayudará a precisarlo.</small></span></div><div className="guidance-note"><Icon name="shield" /><span>Conecta para aprender: evita pedir que otra persona haga una entrega completa por ti.</span></div><button className="button button-primary">Encontrar apoyo <span>→</span></button></form><section><div className="section-heading compact"><div><p className="eyebrow">HISTORIAL</p><h2>Mis solicitudes</h2></div><span className="count-badge">{requests.length}</span></div><div className="request-list">{requests.length ? requests.map((item: any) => <article className="request-card" key={item.id}><div className="request-top"><IsoBadge kind="chat" /><span className="status-pill">{humanStatus(item.status)}</span></div><h3>{item.topic}</h3><p>{item.description}</p><button className="button button-secondary small" onClick={() => calculate(item.id)}>Buscar compañeros <span>→</span></button></article>) : <EmptyState title="Aún no has publicado solicitudes" text="Cuando publiques una duda, podrás seguir su estado desde aquí." badge="chat" />}</div></section></div></section>;
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

function Messages({ connections, selectedId, setSelectedId, messagesByConnection, setMessagesByConnection, realtimeConnected, notify }: any) {
  const active = connections.filter((item: any) => item.status === 'Activa' || item.status === 1);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const currentId = active.some((item: any) => item.id === selectedId) ? selectedId : active[0]?.id ?? '';
  const current = active.find((item: any) => item.id === currentId);
  const messages = messagesByConnection[currentId] ?? [];
  useEffect(() => { if (!selectedId && active[0]) setSelectedId(active[0].id); }, [active.length, selectedId]);
  useEffect(() => { if (!currentId || messagesByConnection[currentId]) return; api('/api/conexiones/' + currentId + '/mensajes').then(items => setMessagesByConnection((value: any) => ({ ...value, [currentId]: items }))).catch((error: unknown) => notify(error instanceof Error ? error.message : 'No pudimos abrir la conversación.')); }, [currentId]);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, currentId]);

  function clearFile() { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(''); setSelectedFile(null); if (fileInput.current) fileInput.current.value = ''; }
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CHAT_FILE_BYTES) { notify('El archivo supera el límite de 10 MB.'); event.target.value = ''; return; }
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
        const data = new FormData(); data.append('file', selectedFile); data.append('caption', draft.trim());
        message = await api('/api/conexiones/' + currentId + '/adjuntos', { method: 'POST', body: data });
      } else message = await api('/api/conexiones/' + currentId + '/mensajes', { method: 'POST', body: JSON.stringify({ text: draft }) });
      setMessagesByConnection((value: any) => ({ ...value, [currentId]: mergeMessage(value[currentId] ?? [], message) }));
      setDraft(''); clearFile();
    } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos enviar el mensaje.'); }
    finally { setSending(false); }
  }

  return <section className="screen"><ScreenIntro kicker="BANDEJA SOCIAL" title="Tus mensajes" description="Toca una conexión para abrir la conversación y seguir aprendiendo juntos." badge="chat" />{active.length ? <div className="chat-layout"><aside className="conversation-list"><div className="conversation-heading"><div><p className="eyebrow">MENSAJES</p><span>{active.length} conexiones activas</span></div><i className={realtimeConnected ? 'live-indicator' : 'live-indicator offline'}>{realtimeConnected ? 'en vivo' : 'reconectando'}</i></div><div className="social-rail" aria-label="Contactos recientes">{active.map((item: any, index: number) => <button className={item.id === currentId ? 'social-story selected' : 'social-story'} key={item.id} onClick={() => { clearFile(); setSelectedId(item.id); }} aria-label={`Abrir conversación con ${item.counterpart}`}><span className={`story-ring story-tone-${index % 4}`}><span>{initials(item.counterpart)}</span><i /></span></button>)}</div></aside><section className="chat-card"><header><div className="chat-person"><span className="chat-avatar">{initials(current?.counterpart)}</span><div><strong>{current?.counterpart}</strong><small>{current?.topic}</small></div></div><span className="safe-chat"><Icon name="shield" /> espacio cuidado</span></header><div className="messages-scroll" aria-live="polite">{messages.length ? messages.map((item: any) => <article className={item.isMine ? 'message-bubble mine' : 'message-bubble'} key={item.id}>{item.attachment && (item.attachment.contentType?.startsWith('image/') ? <ProtectedChatImage attachment={item.attachment} notify={notify} /> : <button className="document-attachment" onClick={() => openChatAttachment(item.attachment).catch((error: Error) => notify(error.message))}><span className="document-icon">DOC</span><span><strong>{item.attachment.fileName}</strong><small>{formatFileSize(item.attachment.sizeBytes)} · Toca para abrir</small></span><b>↓</b></button>)}{item.text && <MessageText text={item.text} /> }<div className="message-meta"><span>{item.isMine ? 'Tú' : current?.counterpart}</span><time>{formatDominicanDateTimeCompact(item.createdAt)}</time></div></article>) : <div className="chat-empty"><IsoBadge kind="chat" large /><h2>Empiecen por un objetivo pequeño</h2><p>Saluda, comparte tu duda y acuerden cómo quieren avanzar.</p></div>}<div ref={messagesEnd} /></div><form className="message-composer" onSubmit={send}>{selectedFile && <div className="attachment-preview">{previewUrl ? <img src={previewUrl} alt="Vista previa del archivo" /> : <span className="document-icon">DOC</span>}<span><strong>{selectedFile.name}</strong><small>{formatFileSize(selectedFile.size)} · máximo 10 MB</small></span><button type="button" onClick={clearFile} aria-label="Quitar archivo">×</button></div>}<div className="composer-row"><input ref={fileInput} className="file-input" type="file" accept={CHAT_FILE_ACCEPT} onChange={chooseFile} aria-label="Seleccionar imagen o documento" /><button type="button" className="attach-button" onClick={() => fileInput.current?.click()} aria-label="Adjuntar imagen o documento">＋</button><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={1500} placeholder={selectedFile ? 'Agrega un mensaje opcional…' : 'Escribe un mensaje…'} aria-label="Mensaje" /><button className="send-button" disabled={sending || (!draft.trim() && !selectedFile)} aria-label="Enviar mensaje">{sending ? '…' : '↗'}</button></div><small className="upload-limit">Imágenes y documentos · máximo 10 MB</small></form></section></div> : <EmptyState title="Tus conversaciones aparecerán aquí" text="Cuando ambos acepten una conexión, el chat se activará automáticamente." badge="chat" />}</section>;
}

function ProtectedChatImage({ attachment, notify }: { attachment: any; notify: (message: string) => void }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let active = true; let objectUrl = ''; const token = localStorage.getItem('conectamente_token'); fetch(`${API}/api/adjuntos/${attachment.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(response => { if (!response.ok) throw new Error(); return response.blob(); }).then(blob => { objectUrl = URL.createObjectURL(blob); if (active) setSrc(objectUrl); }).catch(() => active && notify('No pudimos cargar una imagen del chat.')); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [attachment.id]);
  return <button className="image-attachment" onClick={() => openChatAttachment(attachment).catch((error: Error) => notify(error.message))} aria-label={`Abrir ${attachment.fileName}`}>{src ? <img src={src} alt={attachment.fileName} loading="lazy" /> : <span>Cargando imagen…</span>}</button>;
}

function MessageText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <p>{parts.map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part.includes('meet.google.com') ? 'Abrir Google Meet' : part}</a> : part)}</p>;
}

function NotificationButton({ count, onClick }: { count: number; onClick: () => void }) { return <button className="notification-button" onClick={onClick} aria-label={`Notificaciones, ${count} sin leer`}><Icon name="bell" />{count > 0 && <span>{count > 9 ? '9+' : count}</span>}</button>; }

function NotificationsPanel({ items, onClose, onOpen, onMarkAll }: any) {
  const permission = 'Notification' in window ? window.Notification.permission : 'unsupported';
  async function enableDeviceAlerts() { if ('Notification' in window) await window.Notification.requestPermission(); }
  return <div className="notifications-backdrop" onClick={onClose}><aside className="notifications-panel" onClick={event => event.stopPropagation()}><div className="notifications-head"><div><p className="eyebrow">ACTIVIDAD</p><h2>Notificaciones</h2></div><button className="close-button" onClick={onClose}>×</button></div>{permission === 'default' && <button className="device-alerts" onClick={enableDeviceAlerts}><Icon name="bell" /><span><strong>Activar avisos del dispositivo</strong><small>Recibe alertas aunque estés en otra pantalla.</small></span></button>}<div className="notification-list">{items.length ? items.map((item: any) => <button key={item.id} className={item.isRead ? 'notification-item' : 'notification-item unread'} onClick={() => onOpen(item)}><span className="notification-icon"><Icon name={item.type === 'message' || item.type === 'comment' ? 'message' : item.type === 'session' ? 'calendar' : 'match'} /></span><span><strong>{item.title}</strong><small>{item.body}</small><time>{formatRelative(item.createdAt)}</time></span>{!item.isRead && <i />}</button>) : <EmptyState title="Todo al día" text="Aquí verás solicitudes, mensajes, sesiones y comentarios." badge="network" />}</div>{items.some((item: any) => !item.isRead) && <button className="mark-all" onClick={onMarkAll}>Marcar todo como leído</button>}</aside></div>;
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
  const active = connections.filter((item: any) => item.status === 'Activa' || item.status === 1);
  const pending = connections.filter((item: any) => item.requiresMyResponse);
  const upcomingSessions = sessions.filter((item: any) => (item.status === 'Agendada' || item.status === 0) && new Date(item.date).getTime() >= Date.now());
  const historySessions = sessions.filter((item: any) => !upcomingSessions.some((upcoming: any) => upcoming.id === item.id)).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  async function refresh() { const [currentConnections, currentSessions] = await Promise.all([api('/api/conexiones'), api('/api/sesiones')]); setConnections(currentConnections); setSessions(currentSessions); }
  async function respond(id: string, accept: boolean) { try { await api('/api/conexiones/' + id + '/responder', { method: 'POST', body: JSON.stringify({ accept }) }); await refresh(); notify(accept ? 'Conexión aceptada. Ya pueden organizar una sesión.' : 'Invitación rechazada.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos responder la invitación.'); } }
  async function submit(event: FormEvent) { event.preventDefault(); try { const payload = { durationMinutes: Number(form.durationMinutes), date: dominicanFormToIso(form.date, form.hour, form.minute, form.period), mode: form.mode, objective: form.objective.trim() }; if (editingId) await api('/api/sesiones/' + editingId, { method: 'PUT', body: JSON.stringify(payload) }); else await api('/api/conexiones/' + form.connectionId + '/sesiones', { method: 'POST', body: JSON.stringify(payload) }); await refresh(); setEditingId(null); setForm({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' }); notify(editingId ? 'Encuentro actualizado.' : 'Sesión agendada con una guía inicial.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos guardar el encuentro.'); } }
  function editSession(item: any) { const parts = dominicanSessionParts(item.date); setEditingId(item.id); setForm({ connectionId: item.connectionId, date: parts.date, hour: parts.hour, minute: parts.minute, period: parts.period, durationMinutes: item.durationMinutes, mode: item.mode, objective: item.objective }); if (item.meetUrl) notify('Recuerda actualizar también el evento en Google Calendar.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function deleteSession() { if (!pendingDelete) return; const item = pendingDelete; setPendingDelete(null); try { await api('/api/sesiones/' + item.id, { method: 'DELETE' }); await refresh(); if (editingId === item.id) { setEditingId(null); setForm({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' }); } notify('Encuentro eliminado.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos eliminar el encuentro.'); } }
  async function createGoogleMeet(item: any) { setMeetingSessionId(item.id); try { const accessToken = await requestGoogleCalendarAccess(); const result = await api('/api/sesiones/' + item.id + '/google-meet', { method: 'POST', body: JSON.stringify({ accessToken }) }); await refresh(); notify(result.pending ? result.message : 'Google Meet creado y compartido automáticamente en el chat.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos crear Google Meet.'); } finally { setMeetingSessionId(null); } }
  async function completeSession(item: any) { try { await api('/api/sesiones/' + item.id + '/completar', { method: 'POST' }); await refresh(); notify(item.isRequester ? 'Sesión completada. Ya puedes calificar la orientación.' : 'Sesión marcada como completada.'); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos completar la sesión.'); } }
  const resetForm = () => { setEditingId(null); setForm({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' }); };

  return <>
    <section className="screen">
      <ScreenIntro kicker="COORDINACIÓN" title="Hazle espacio al aprendizaje" description="Propón una sesión breve, con objetivo claro y confirmación de ambas personas." badge="book" />
      {pending.length > 0 && <section className="invitation-strip"><div><p className="eyebrow">INVITACIONES</p><strong>{pending.length} compañero quiere conectar contigo</strong></div>{pending.map((item: any) => <article key={item.id}><IsoBadge kind="network" /><span><b>{item.counterpart}</b><small>{item.topic}</small></span><button className="button button-primary small" onClick={() => respond(item.id, true)}>Aceptar</button><button className="button button-ghost small" onClick={() => respond(item.id, false)}>Ahora no</button></article>)}</section>}
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
    {ratingSession && <RatingDialog session={ratingSession} onCancel={() => setRatingSession(null)} onSaved={async () => { setRatingSession(null); await refresh(); notify('Gracias. Tu valoración ya forma parte de la reputación del colaborador.'); }} />}
  </>;
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
function IsoBadge({ kind, large = false }: { kind: 'book' | 'chat' | 'network'; large?: boolean }) { return <span className={`iso-badge iso-${kind}${large ? ' iso-large' : ''}`} aria-hidden="true" />; }
function NavButton({ item, active, onClick }: { item: { id: Tab; label: string; icon: IconName }; active: boolean; onClick: () => void }) { return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}><Icon name={item.icon} /><span>{item.label}</span></button>; }

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = { home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6', profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0', request: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h3', match: 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a4 4 0 1 0 0-8M2 20a6 6 0 0 1 12 0m-2-3a6 6 0 0 1 10 3', message: 'M4 5h16v11H8l-4 4V5Zm4 5h8m-8 3h5', bell: 'M6 17h12l-2-3V9a4 4 0 0 0-8 0v5l-2 3Zm4 3h4', search: 'm21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', calendar: 'M4 7h16v13H4zM8 3v4m8-4v4M4 11h16m-5 3-3 3-2-2', shield: 'M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Zm-3 9 2 2 4-4', chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2', star: 'm12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6-4.36-4.25 6.03-.88L12 3Z', more: 'M5 12h.01M12 12h.01M19 12h.01' };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function initials(name?: string) { return (name || 'CM').split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function humanStatus(status: unknown) { return String(status ?? 'abierta').replaceAll('_', ' ').replace(/^./, value => value.toUpperCase()); }
function mergeMessage(items: any[], item: any) { return items.some(current => current.id === item.id) ? items : [...items, item]; }
function formatDominicanTime(value: string | Date) { return new Intl.DateTimeFormat(DO_LOCALE, { timeZone: DO_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)); }
function formatDominicanDate(value: string | Date) { return new Intl.DateTimeFormat(DO_LOCALE, { timeZone: DO_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
function formatDominicanDateLong(value: string | Date) { return new Intl.DateTimeFormat(DO_LOCALE, { timeZone: DO_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)); }
function formatDominicanDateTimeCompact(value: string | Date) { return `${formatDominicanNumericDate(value)} · ${formatDominicanTime(value)}`; }
function formatFileSize(value: number) { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`; }
function formatDominicanNumericDate(value: string | Date) { return new Intl.DateTimeFormat(DO_LOCALE, { timeZone: DO_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)); }
function dominicanSessionParts(value: string | Date) { const parts = new Intl.DateTimeFormat('en-US', { timeZone: DO_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(value)); const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''; return { date: `${get('day')}/${get('month')}/${get('year')}`, hour: get('hour'), minute: get('minute'), period: get('dayPeriod') === 'PM' ? 'PM' : 'AM' }; }
function dominicanDateKey(value: string | Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: DO_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
function formatRelative(value: string) { const date = new Date(value); const today = new Date(); const yesterday = new Date(today.getTime() - 86_400_000); const key = dominicanDateKey(date); if (key === dominicanDateKey(today)) return `Hoy, ${formatDominicanTime(date)}`; if (key === dominicanDateKey(yesterday)) return `Ayer, ${formatDominicanTime(date)}`; return formatDominicanDateTimeCompact(date); }
function dominicanFormToIso(date: string, hour: string, minute: string, period: string) { const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date); if (!match) throw new Error('Escribe la fecha en formato DD/MM/AAAA.'); const [, day, month, year] = match; const twelveHour = Number(hour); if (twelveHour < 1 || twelveHour > 12) throw new Error('Selecciona una hora válida.'); const twentyFourHour = (twelveHour % 12) + (period === 'PM' ? 12 : 0); const candidate = new Date(`${year}-${month}-${day}T12:00:00-04:00`); if (Number.isNaN(candidate.getTime()) || formatDominicanNumericDate(candidate) !== `${day}/${month}/${year}`) throw new Error('La fecha indicada no es válida.'); return `${year}-${month}-${day}T${String(twentyFourHour).padStart(2, '0')}:${minute}:00-04:00`; }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
