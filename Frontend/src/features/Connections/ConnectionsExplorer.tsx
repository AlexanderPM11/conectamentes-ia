import { useState, useEffect } from 'react';
import { api } from '../../shared/api/client';
import { initials } from '../../utils/string';
import { ScreenIntro, Icon, IsoBadge, EmptyState } from '../../components';

export function ConnectionsExplorer({ matches, requestId, notify, onRequestTopic }: any) {
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
  
  return (
    <section className="screen">
      <ScreenIntro kicker="DESCUBRIR COMUNIDAD" title="Encuentra personas por tema" description="Busca quién puede ayudarte o quién quiere aprender contigo. Solo aparecen temas que cada persona decidió compartir." badge="network" />
      <section className="discovery-search surface-card">
        <div className="search-field">
          <Icon name="search" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Busca un tema, una materia o una persona…" aria-label="Buscar en la comunidad" />
        </div>
        <div className="discovery-filters" role="group" aria-label="Filtrar por intención">
          <button className={kind === 'todos' ? 'filter-chip active' : 'filter-chip'} onClick={() => setKind('todos')}>Todas las personas</button>
          <button className={kind === 'Domina' ? 'filter-chip active' : 'filter-chip'} onClick={() => setKind('Domina')}><span className="filter-dot offer" />Puede ayudar</button>
          <button className={kind === 'NecesitaApoyo' ? 'filter-chip active' : 'filter-chip'} onClick={() => setKind('NecesitaApoyo')}><span className="filter-dot need" />Necesita apoyo</button>
        </div>
      </section>
      
      {requestId && matches.length > 0 && <RequestMatches matches={matches} requestId={requestId} notify={notify} /> }
      
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
            <article className="discovery-card" key={item.id}>
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
                  <button className="button button-secondary small" onClick={() => onRequestTopic(item.topic)}>
                    Aprender sobre este tema <span>→</span>
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No encontramos ese tema todavía" text="Prueba con otra palabra o publica una solicitud para que la comunidad pueda encontrarte." badge="network" />
      )}
    </section>
  );
}

export function RequestMatches({ matches, requestId, notify }: any) {
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
    <section className="screen">
      <ScreenIntro kicker="COMPATIBILIDAD EXPLICABLE" title="Personas que pueden ayudarte" description="Cada recomendación incluye una razón clara. Tú decides con quién conectar." badge="network" />
      {!requestId || matches.length === 0 ? (
        <EmptyState title="Todavía no hay conexiones sugeridas" text="Publica una solicitud y selecciona “Buscar compañeros” para ver recomendaciones." badge="network" />
      ) : (
        <div className="match-grid">
          {matches.map((item: any, index: number) => (
            <article className="match-card" key={item.id}>
              <div className="match-avatar">{initials(item.candidate)}<span>{index + 1}</span></div>
              <div className="match-score"><strong>{Math.round(item.score)}%</strong><span>compatible</span></div>
              <h3>{item.candidate}</h3>
              <p>{item.explanation}</p>
              <div className="reason-chips"><span>Tema afín</span><span>Horario compatible</span></div>
              <div className="card-actions">
                <button className="button button-primary small" onClick={() => accept(item.id)}>Conectar</button>
                <button className="button button-ghost small" onClick={() => reject(item.id)}>Ahora no</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
