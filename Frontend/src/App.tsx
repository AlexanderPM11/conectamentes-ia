import { CSSProperties, FormEvent, useEffect, useState } from 'react';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { API, api } from './shared/api/client';
import { unsubscribeDevicePush } from './utils/push';
import { Brand, NavButton, IsoBadge, NotificationButton, ProfileAvatar, UpdatePrompt, usePwaUpdate, NotificationsPanel, Icon } from './components';

import { Welcome } from './features/Welcome/Welcome';
import { Home } from './features/Home/Home';
import { Profile } from './features/Profile/Profile';
import { Requests, AiRequestDialog } from './features/Requests/Requests';
import { ConnectionsExplorer } from './features/Connections/ConnectionsExplorer';
import { Messages } from './features/Messages/Messages';
import { Ranking } from './features/Ranking/Ranking';
import { Security } from './features/Security/Security';
import { InstitutionalPanel } from './features/Institutional/InstitutionalPanel';
import { AdminPanel } from './features/Admin/AdminPanel';

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
  { id: 'seguridad', label: 'Seguridad', icon: 'shield' },
  { id: 'panel', label: 'Panel', icon: 'chart' },
  { id: 'admin', label: 'Administración', icon: 'shield' }
];

function mergeMessage(items: any[], item: any) { return items.some(current => current.id === item.id) ? items : [...items, item]; }

export function App() {
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
  const [selectedRequest, setSelectedRequest] = useState('');
  const [profile, setProfile] = useState<any>({ habilidades: [], disponibilidad: null });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [messagesByConnection, setMessagesByConnection] = useState<Record<string, any[]>>({});
  const [chatConnectionId, setChatConnectionId] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [requestForm, setRequestForm] = useState({ topic: '', description: '', helpType: 'comprender', desiredSchedule: '' });
  const [editingRequest, setEditingRequest] = useState<string | null>(null);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [logged, setLogged] = useState(() => Boolean(localStorage.getItem('conectamente_token')));
  
  const canViewPanel = me?.roles?.some((role: string) => role === 'coordinator' || role === 'moderator');
  const canViewAdmin = me?.roles?.some((role: string) => role === 'superadmin');
  const availableNavItems = navItems.filter(item => (item.id !== 'panel' || canViewPanel) && (item.id !== 'admin' || canViewAdmin));

  useEffect(() => { 
    if (!logged) return; 
    api('/api/usuarios/me').then(setMe).catch(showError); 
    api('/api/perfil').then(setProfile).catch(showError); 
    api('/api/solicitudes/mias').then(setRequests).catch(showError); 
    api('/api/conexiones').then(setConnections).catch(showError); 
    api('/api/notificaciones').then(setNotifications).catch(showError); 
  }, [logged]);
  
  useEffect(() => { 
    if (logged && tab === 'perfil') api('/api/perfil').then(setProfile).catch(showError); 
    if (logged && tab === 'solicitudes') api('/api/solicitudes/mias').then(setRequests).catch(showError); 
    if (logged && tab === 'seguridad') api('/api/conexiones').then(setConnections).catch(showError);
  }, [logged, tab]);
  
  useEffect(() => {
    if (!logged || !me?.id) return;
    const token = localStorage.getItem('conectamente_token') ?? '';
    const realtime = new HubConnectionBuilder().withUrl(API + '/hubs/realtime', { accessTokenFactory: () => token }).withAutomaticReconnect().configureLogging(LogLevel.Warning).build();
    realtime.on('NotificationReceived', item => {
      setNotifications(current => current.some(entry => entry.id === item.id) ? current : [item, ...current]);
    });
    realtime.on('ChatMessageReceived', item => setMessagesByConnection(current => ({ ...current, [item.connectionId]: mergeMessage(current[item.connectionId] ?? [], { ...item, isMine: item.senderId === me?.id }) })));
    realtime.on('ChatMessageDeleted', item => setMessagesByConnection(current => ({ ...current, [item.connectionId]: (current[item.connectionId] ?? []).filter(message => message.id !== item.messageId) })));
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

  function showError(error: unknown) { 
    if (error instanceof Error && error.message === 'Tu sesión ha expirado.') { 
      unsubscribeDevicePush().catch(() => undefined); 
      localStorage.removeItem('conectamente_token'); 
      setMe(null); setLogged(false); setMode('login'); setTab('inicio'); setNotice(error.message); 
      return; 
    } 
    setNotice(error instanceof Error ? error.message : 'Ocurrió un error.'); 
  }
  
  async function signOut() { 
    await unsubscribeDevicePush(); 
    localStorage.removeItem('conectamente_token'); 
    setMe(null); setLogged(false); setMode('welcome'); setTab('inicio'); 
  }

  async function authSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const path = mode === 'login' ? '/api/auth/login' : mode === 'register' ? '/api/auth/registro' : '/api/auth/recuperar-contrasena';
    try { 
      const result = await api(path, { method: 'POST', body: JSON.stringify(data) }); 
      if (result?.accessToken) { 
        localStorage.setItem('conectamente_token', result.accessToken); 
        setLogged(true); setMe(result.user); setMode('welcome'); 
      } else {
        setNotice('Si los datos son válidos, recibirás instrucciones para continuar.'); 
      }
    } catch (error) { showError(error); } finally { setBusy(false); }
  }
  
  async function googleLogin(credential: string) { 
    try { 
      const result = await api('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }); 
      localStorage.setItem('conectamente_token', result.accessToken); 
      setLogged(true); setMe(result.user); setMode('welcome'); 
    } catch (error) { showError(error); } 
  }
  
  async function submitRequest(event: FormEvent) { 
    event.preventDefault(); 
    try { 
      if (editingRequest) {
        await api('/api/solicitudes/' + editingRequest, { method: 'PUT', body: JSON.stringify(requestForm) }); 
        setNotice('Solicitud actualizada correctamente.'); 
        setEditingRequest(null);
      } else {
        await api('/api/solicitudes', { method: 'POST', body: JSON.stringify(requestForm) }); 
        setNotice('Solicitud publicada. Ya puedes buscar compañeros compatibles.'); 
      }
      setRequestForm({ topic: '', description: '', helpType: 'comprender', desiredSchedule: '' }); 
      setRequests(await api('/api/solicitudes/mias')); 
    } catch (error) { showError(error); } 
  }

  async function deleteRequest(id: string) {
    try {
      await api('/api/solicitudes/' + id, { method: 'DELETE' });
      setNotice('Solicitud eliminada correctamente.');
      if (editingRequest === id) {
        setEditingRequest(null);
        setRequestForm({ topic: '', description: '', helpType: 'comprender', desiredSchedule: '' });
      }
      setRequests(await api('/api/solicitudes/mias'));
    } catch (error) { showError(error); }
  }
  
  async function calculate(requestId: string) { 
    try { 
      await api('/api/solicitudes/' + requestId + '/calcular-coincidencias', { method: 'POST' }); 
      setSelectedRequest(requestId); 
      setMatches(await api('/api/solicitudes/' + requestId + '/coincidencias')); 
      setTab('coincidencias'); 
      setNotice('Encontramos compañeros compatibles con tu solicitud.'); 
    } catch (error) { showError(error); } 
  }
  
  async function navigate(next: Tab) { 
    setTab(next); setShowMore(false); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); 
    try { 
      if (next === 'perfil') setProfile(await api('/api/perfil')); 
      if (next === 'solicitudes') setRequests(await api('/api/solicitudes/mias')); 
      if (next === 'mensajes') setConnections(await api('/api/conexiones')); 
      if (next === 'seguridad') setConnections(await api('/api/conexiones'));
    } catch (error) { showError(error); } 
  }
  
  async function markAllRead() { 
    await api('/api/notificaciones/leer-todas', { method: 'POST' }); 
    setNotifications(current => current.map(item => ({ ...item, isRead: true }))); 
  }
  
  async function openNotification(item: any) { 
    if (!item.isRead) { 
      await api('/api/notificaciones/' + item.id + '/leer', { method: 'POST' }); 
      setNotifications(current => current.map(entry => entry.id === item.id ? { ...entry, isRead: true } : entry)); 
    } 
    setShowNotifications(false); 
    if (item.referenceId && ['message', 'connection_accepted', 'session', 'comment'].includes(item.type)) { 
      setChatConnectionId(item.referenceId); navigate('mensajes'); 
    } else if (item.type === 'connection_request') {
      navigate('coincidencias');
      setNotice('Tienes una nueva solicitud de conexión.');
    }
  }

  const unreadCount = notifications.filter(item => !item.isRead).length;
  const primaryNavItems = navItems.slice(0, 4);
  const secondaryTabActive = ['perfil', 'ranking', 'seguridad', 'panel', 'admin'].includes(tab);
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

  return (
    <>
      <div className={`app-layout ${isChatActive ? 'in-chat-screen' : ''} ${isChatMobileConversation ? 'in-chat-mobile in-conversation-active' : ''} ${isKeyboardOpen ? 'keyboard-open' : ''}`}>
        <aside className="sidebar">
          <Brand />
          <nav className="side-nav" aria-label="Navegación principal">
            {availableNavItems.map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />)}
          </nav>
          <div className="sidebar-note">
            <IsoBadge kind="network" />
            <p>Conexiones cuidadas, aprendizaje compartido.</p>
          </div>
        </aside>
        
        <main className="app-main">
          <header className="mobile-header">
            <Brand />
            <div className="header-actions">
              <NotificationButton count={unreadCount} onClick={() => setShowNotifications(true)} />
              <button className="avatar-button" aria-label="Abrir perfil" onClick={() => navigate('perfil')}>
                <ProfileAvatar userId={me?.id} name={me?.displayName} version={me?.avatarUpdatedAt} />
              </button>
            </div>
          </header>
          <header className="desktop-topbar">
            <div>
              <span className={realtimeConnected ? 'presence-dot' : 'presence-dot offline'} />
              {realtimeConnected ? 'Comunidad conectada' : 'Reconectando…'}
            </div>
            <div className="user-menu">
              <NotificationButton count={unreadCount} onClick={() => setShowNotifications(true)} />
              <span>{me?.displayName ?? 'Estudiante'}</span>
              <button className="avatar-button" onClick={() => navigate('perfil')}>
                <ProfileAvatar userId={me?.id} name={me?.displayName} version={me?.avatarUpdatedAt} />
              </button>
              <button className="logout" onClick={signOut}>Salir</button>
            </div>
          </header>
          
          <div className="screen-content">
            {notice && <div className="toast" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Cerrar mensaje">×</button></div>}
            {tab === 'inicio' && <Home me={me} profile={profile} requests={requests} connections={connections} navigate={navigate} />}
            {tab === 'perfil' && <Profile profile={profile} setProfile={setProfile} notify={setNotice} userId={me?.id} user={me} setMe={setMe} onOpenRanking={() => navigate('ranking')} />}
            {tab === 'solicitudes' && <Requests requests={requests} form={requestForm} setForm={setRequestForm} submit={submitRequest} calculate={calculate} notify={setNotice} editingRequest={editingRequest} setEditingRequest={setEditingRequest} deleteRequest={deleteRequest} />}
            {tab === 'coincidencias' && <ConnectionsExplorer matches={matches} requestId={selectedRequest} notify={setNotice} onRequestTopic={(topic: string) => { setRequestForm({ ...requestForm, topic, description: `Quiero encontrar una persona para aprender sobre ${topic}.`, helpType: 'comprender', desiredSchedule: '' }); navigate('solicitudes'); }} />}
            {tab === 'mensajes' && messagesView}
            {tab === 'ranking' && <Ranking notify={setNotice} />}
            {tab === 'seguridad' && <Security connections={connections} notify={setNotice} />}
            {tab === 'panel' && <InstitutionalPanel />}
            {tab === 'admin' && <AdminPanel notify={setNotice} />}
          </div>
          
          <nav className="bottom-nav" aria-label="Navegación móvil" style={{ '--active-index': bottomActiveIndex } as CSSProperties}>
            <span className="bottom-nav-indicator" aria-hidden="true" />
            {primaryNavItems.map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />)}
            <button className={showMore || secondaryTabActive ? 'nav-button active' : 'nav-button'} onClick={() => setShowMore(true)}>
              <Icon name="more" /><span>Más</span>
            </button>
          </nav>
          
          {showMore && (
            <div className="sheet-backdrop" onClick={() => setShowMore(false)}>
              <section className="more-sheet" onClick={event => event.stopPropagation()}>
                <div className="sheet-handle" />
                <div className="sheet-title">
                  <div>
                    <p className="eyebrow">MÁS OPCIONES</p>
                    <h2>Tu espacio completo</h2>
                  </div>
                  <button className="close-button" onClick={() => setShowMore(false)}>×</button>
                </div>
                {availableNavItems.slice(4).map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />)}
                <button className="sheet-logout" onClick={signOut}>Cerrar sesión</button>
              </section>
            </div>
          )}
          
          {showNotifications && <NotificationsPanel items={notifications} onClose={() => setShowNotifications(false)} onOpen={openNotification} onMarkAll={markAllRead} />}
          
          {tab === 'solicitudes' && (
            <>
              <button
                type="button"
                className="ai-fab-button"
                onClick={() => setShowAiDialog(true)}
                aria-label="Redactar con Asistente IA"
                title="Redactar con Asistente IA"
              >
                <svg className="ai-fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                  <path d="M5 3v4" />
                  <path d="M3 5h4" />
                  <path d="M19 17v4" />
                  <path d="M17 19h4" />
                </svg>
                <span className="ai-fab-pulse" aria-hidden="true" />
              </button>
              <AiRequestDialog
                open={showAiDialog}
                onClose={() => setShowAiDialog(false)}
                onApply={(topic: string, description: string) => {
                  setRequestForm({ ...requestForm, topic, description });
                  setNotice('Sugerencia de IA aplicada a tu solicitud.');
                }}
                notify={setNotice}
              />
            </>
          )}
        </main>
      </div>
      <UpdatePrompt {...pwaUpdate} />
    </>
  );
}
