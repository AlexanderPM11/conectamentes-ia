import { useState, useEffect } from 'react';
import { api } from '../../shared/api/client';
import { initials } from '../../utils/string';
import { ScreenIntro, Icon, IsoBadge, EmptyState, ProfileAvatar, ConfirmDialog } from '../../components';
import { UserProfileView } from './UserProfileView';
import { connectionStatus } from './ConnectionStatusPanel';

export function ConnectionsExplorer({ matches, requestId, notify, onRequestTopic, onOpenChat, connections, onRefreshConnections }: any) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'todas' | 'necesito_apoyo'>(requestId ? 'necesito_apoyo' : 'todas');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (requestId) {
      setKind('necesito_apoyo');
    }
  }, [requestId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const path = kind === 'necesito_apoyo'
      ? '/api/descubrimiento/necesito-apoyo'
      : `/api/descubrimiento?topic=${encodeURIComponent(query)}&type=`;
    const timer = window.setTimeout(() => api(path)
      .then(items => { if (!cancelled) setResults(items); })
      .catch(error => { if (!cancelled) notify(error instanceof Error ? error.message : 'No pudimos buscar en la comunidad.'); })
      .finally(() => { if (!cancelled) setLoading(false); }), 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, kind]);

  const labelFor = (item: any) => item.type === 'Domina' || item.type === 0 ? 'Puede reforzar conocimientos' : 'Busca apoyo para reforzar';
  
  if (selectedUserId) {
    const selectedItem = results.find(r => r.userId === selectedUserId) || matches?.find((m: any) => m.userId === selectedUserId || m.candidateId === selectedUserId);
    return (
      <UserProfileView
        userId={selectedUserId}
        onBack={() => setSelectedUserId(null)}
        alreadyConnected={selectedItem?.hasConnection || false}
        onRequestSupport={(topic) => {
          setSelectedUserId(null);
          onRequestTopic(topic);
        }}
        onOpenChat={onOpenChat}
        onConnect={async () => {
          try {
            if (selectedItem?.score !== undefined) {
              await api('/api/coincidencias/' + selectedItem.id + '/aceptar', { method: 'POST' });
              notify('Conexión propuesta enviada correctamente.');
            } else {
              await api('/api/conexiones/directa/' + selectedUserId, { method: 'POST' });
              notify('Solicitud de conexión enviada');
            }
            setResults(results.map(r => r.userId === selectedUserId ? { ...r, hasConnection: true } : r));
            setSelectedUserId(null);
          } catch (error) {
            notify(error instanceof Error ? error.message : 'Error al conectar');
          }
        }}
      />
    );
  }

  return (
    <section className="screen">
      <ScreenIntro kicker="DESCUBRIR COMUNIDAD" title="Encuentra personas por tema" description="Busca quién puede ayudarte o quién quiere aprender contigo. Explora la comunidad y conecta directamente." badge="network" />
      <section className="discovery-search surface-card">
        {kind === 'todas' && (
          <div className="search-field">
            <Icon name="search" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Busca un tema, una materia o una persona…" aria-label="Buscar en la comunidad" />
          </div>
        )}
        <div className="discovery-filters" role="group" aria-label="Filtrar por intención">
          <button className={kind === 'todas' ? 'filter-chip active' : 'filter-chip'} onClick={() => setKind('todas')}>Todas las personas</button>
          <button className={kind === 'necesito_apoyo' ? 'filter-chip active' : 'filter-chip'} onClick={() => setKind('necesito_apoyo')}><span className="filter-dot need" />Necesito apoyo</button>
        </div>
      </section>

      <ConnectionRequestsPanel connections={connections} notify={notify} onOpenChat={onOpenChat} onRefresh={onRefreshConnections} />
      
      <DiscoveryResults results={results} loading={loading} labelFor={labelFor} notify={notify} onSelectUser={setSelectedUserId} setResults={setResults} emptyTitle={kind === 'necesito_apoyo' ? 'No encontramos personas para tus solicitudes' : 'No encontramos ese tema todavía'} emptyText={kind === 'necesito_apoyo' ? 'Agrega un tema o una descripción más específica en tus solicitudes para encontrar personas que lo dominen.' : 'Prueba con otra palabra o publica una solicitud para que la comunidad pueda encontrarte.'} />
    </section>
  );
}

function ConnectionRequestsPanel({ connections = [], notify, onOpenChat, onRefresh }: any) {
  const [pendingAction, setPendingAction] = useState<any | null>(null);
  const pending = connections.filter((item: any) => connectionStatus(item.status) === 'pendiente');
  const incoming = pending.filter((item: any) => item.requiresMyResponse);
  const outgoing = pending.filter((item: any) => item.isRequester);

  async function respond(item: any, accept: boolean) {
    try {
      await api(`/api/conexiones/${item.id}/responder`, { method: 'POST', body: JSON.stringify({ accept }) });
      await onRefresh();
      notify(accept ? `Ahora están conectados con ${item.counterpart}.` : 'Solicitud rechazada.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No pudimos actualizar la solicitud.');
    }
  }

  async function cancel(item: any) {
    try {
      await api(`/api/conexiones/${item.id}/cancelar`, { method: 'POST' });
      await onRefresh();
      notify('Solicitud cancelada. Ya no podrá abrir un chat contigo.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No pudimos cancelar la solicitud.');
    } finally {
      setPendingAction(null);
    }
  }

  if (!pending.length) return null;

  return <>
    <section className="connection-requests-panel surface-card">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">GESTIÓN DE CONEXIONES</p>
          <h2>Solicitudes y estados</h2>
        </div>
        <span className="count-badge">{pending.length}</span>
      </div>
      <p className="connection-requests-intro">Aquí puedes revisar quién quiere conectar contigo y administrar las solicitudes que enviaste.</p>

      <div className="connection-request-columns">
        <RequestGroup title="Te han solicitado conectar" empty="No tienes solicitudes recibidas." items={incoming}>
          {(item: any) => <div className="connection-request-row" key={item.id}>
            <ProfileAvatar userId={item.counterpartId} name={item.counterpart} version={item.counterpartAvatarUpdatedAt} className="connection-request-avatar" />
            <div className="connection-request-copy"><strong>{item.counterpart}</strong><small>{item.topic || 'Conexión directa'}</small><span className="status-pill pending">Pendiente de tu respuesta</span></div>
            <div className="connection-request-actions"><button className="button button-primary small" onClick={() => respond(item, true)}>Aceptar</button><button className="button button-danger small" onClick={() => setPendingAction({ type: 'reject', item })}>Rechazar</button></div>
          </div>}
        </RequestGroup>

        <RequestGroup title="Solicitudes que enviaste" empty="No has enviado solicitudes pendientes." items={outgoing}>
          {(item: any) => <div className="connection-request-row" key={item.id}>
            <ProfileAvatar userId={item.counterpartId} name={item.counterpart} version={item.counterpartAvatarUpdatedAt} className="connection-request-avatar" />
            <div className="connection-request-copy"><strong>{item.counterpart}</strong><small>{item.topic || 'Conexión directa'}</small><span className="status-pill pending">Esperando respuesta</span></div>
            <div className="connection-request-actions"><button className="button button-ghost small" onClick={() => setPendingAction({ type: 'cancel', item })}>Cancelar</button></div>
          </div>}
        </RequestGroup>
      </div>

    </section>
    {pendingAction && <ConfirmDialog title={pendingAction.type === 'cancel' ? '¿Cancelar esta solicitud?' : '¿Rechazar esta solicitud?'} message={pendingAction.type === 'cancel' ? `La solicitud a ${pendingAction.item.counterpart} se cerrará y no podrá abrirse un chat mientras no exista una nueva conexión.` : `La solicitud de ${pendingAction.item.counterpart} se rechazará y no tendrá acceso a una conversación contigo.`} confirmLabel={pendingAction.type === 'cancel' ? 'Cancelar solicitud' : 'Rechazar solicitud'} onConfirm={() => pendingAction.type === 'cancel' ? cancel(pendingAction.item) : respond(pendingAction.item, false).then(() => setPendingAction(null))} onCancel={() => setPendingAction(null)} />}
  </>;
}

function RequestGroup({ title, empty, items, children }: any) {
  return <section className="connection-request-group"><div className="connection-subheading"><strong>{title}</strong><span>{items.length}</span></div>{items.length ? <div className="connection-request-list">{items.map(children)}</div> : <p className="connection-request-empty">{empty}</p>}</section>;
}

function DiscoveryResults({ results, loading, labelFor, notify, onSelectUser, setResults, emptyTitle, emptyText }: any) {
  return (
    <>
      <div className="section-heading discovery-heading">
        <div>
          <p className="eyebrow">RESULTADOS ABIERTOS</p>
          <h2>{loading ? 'Buscando personas…' : `${results.length} perfiles encontrados`}</h2>
        </div>
        <IsoBadge kind="chat" />
      </div>

      {loading ? (
        <div className="discovery-loading"><span /><span /><span /></div>
      ) : results.length ? (
        <div className="discovery-grid">
          {results.map((item: any) => (
            <article className="discovery-card clickable-card" key={item.id} onClick={() => onSelectUser(item.userId)}>
              <div className="discovery-card-top">
                <ProfileAvatar userId={item.userId} name={item.displayName} className="discovery-avatar" />
                <span className={item.type === 'Domina' || item.type === 0 ? 'intent-pill offer' : 'intent-pill need'}>{labelFor(item)}</span>
              </div>
              <h3>{item.topic}</h3>
              <p className="discovery-person">{item.displayName} <span>·</span> {item.career || 'Comunidad ConectaMentes'}</p>
              <div className="discovery-meta">
                <span>Confianza {item.confidence}/5</span>
                {item.hasConnection ? (
                  <span className="status-pill">{item.isConnected ? 'Ya conectados' : 'Solicitud en proceso'}</span>
                ) : (
                  <button className="button button-primary small" onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await api('/api/conexiones/directa/' + item.userId, { method: 'POST' });
                      notify('Solicitud de conexión enviada a ' + item.displayName);
                      setResults((current: any[]) => current.map(r => r.userId === item.userId ? { ...r, hasConnection: true } : r));
                    } catch (error) {
                      notify(error instanceof Error ? error.message : 'Error al conectar');
                    }
                  }}>
                    Conectar
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title={emptyTitle} text={emptyText} badge="network" />
      )}
    </>
  );
}

export function RequestMatches({ matches, requestId, notify, onSelectUser }: any) {
  async function accept(id: string) { 
    try { 
      await api('/api/coincidencias/' + id + '/aceptar', { method: 'POST' }); 
      notify('Conexión propuesta. Falta la aceptación del colaborador.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos aceptar la coincidencia.'); 
    } 
  }
  
  async function reject(id: string) { 
    try { 
      await api('/api/coincidencias/' + id + '/rechazar', { method: 'POST' }); 
      notify('Recomendación descartada sin penalización.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos rechazar la coincidencia.'); 
    } 
  }
  
  return (
    <>
      <div className="section-heading discovery-heading">
        <div>
          <p className="eyebrow">SUGERENCIAS</p>
          <h2>Personas sugeridas para ti</h2>
        </div>
        <IsoBadge kind="network" />
      </div>
      {!requestId || matches.length === 0 ? (
        <EmptyState title="Todavía no hay conexiones sugeridas" text="Publica una solicitud en la pestaña de Solicitudes para ver personas compatibles aquí." badge="network" />
      ) : (
        <div className="match-grid">
          {matches.map((item: any, index: number) => (
            <article className="match-card clickable-card" key={item.id} onClick={() => onSelectUser(item.candidateId)}>
              <div className="match-avatar-container">
                <ProfileAvatar userId={item.candidateId} name={item.candidate} className="match-avatar" />
                <span className="match-rank">{index + 1}</span>
              </div>
              <div className="match-score"><strong>{Math.round(item.score)}%</strong><span>compatible</span></div>
              <h3>{item.candidate}</h3>
              <p>{item.explanation}</p>
              <div className="reason-chips"><span>Tema afín</span><span>Horario compatible</span></div>
              <div className="card-actions">
                <button className="button button-primary small" onClick={(e) => { e.stopPropagation(); accept(item.id); }}>Conectar</button>
                <button className="button button-ghost small" onClick={(e) => { e.stopPropagation(); reject(item.id); }}>Ahora no</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
