import { useState, useEffect } from 'react';
import { api } from '../../shared/api/client';
import { initials } from '../../utils/string';
import { ScreenIntro, Icon, IsoBadge, EmptyState } from '../../components';
import { UserProfileView } from './UserProfileView';

export function ConnectionsExplorer({ matches, requestId, notify, onRequestTopic }: any) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'todas' | 'necesito_apoyo'>('todas');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (kind === 'necesito_apoyo') return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => api(`/api/descubrimiento?topic=${encodeURIComponent(query)}&type=`)
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
        onConnect={async () => {
          try {
            await api('/api/conexiones/directa/' + selectedUserId, { method: 'POST' });
            notify('Solicitud de conexión enviada');
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
      
      {kind === 'necesito_apoyo' ? (
        <RequestMatches matches={matches} requestId={requestId} notify={notify} onSelectUser={setSelectedUserId} />
      ) : (
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
              {results.map(item => (
                <article className="discovery-card clickable-card" key={item.id} onClick={() => setSelectedUserId(item.userId)}>
                  <div className="discovery-card-top">
                    <span className="discovery-avatar">{initials(item.displayName)}</span>
                    <span className={item.type === 'Domina' || item.type === 0 ? 'intent-pill offer' : 'intent-pill need'}>{labelFor(item)}</span>
                  </div>
                  <h3>{item.topic}</h3>
                  <p className="discovery-person">{item.displayName} <span>·</span> {item.career || 'Comunidad ConectaMentes'}</p>
                  <div className="discovery-meta">
                    <span>Confianza {item.confidence}/5</span>
                    {item.hasConnection ? (
                      <span className="status-pill">Ya conectados</span>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="button button-secondary small" onClick={(e) => { e.stopPropagation(); onRequestTopic(item.topic); }}>
                          Solicitar apoyo
                        </button>
                        <button className="button button-primary small" onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await api('/api/conexiones/directa/' + item.userId, { method: 'POST' });
                            notify('Solicitud de conexión enviada a ' + item.displayName);
                            setResults(results.map(r => r.userId === item.userId ? { ...r, hasConnection: true } : r));
                          } catch (error) {
                            notify(error instanceof Error ? error.message : 'Error al conectar');
                          }
                        }}>
                          Conectar
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No encontramos ese tema todavía" text="Prueba con otra palabra o publica una solicitud para que la comunidad pueda encontrarte." badge="network" />
          )}
        </>
      )}
    </section>
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
              <div className="match-avatar">{initials(item.candidate)}<span>{index + 1}</span></div>
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
