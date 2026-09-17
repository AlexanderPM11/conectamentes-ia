import { useState, useEffect } from 'react';
import { api } from '../../shared/api/client';
import { initials } from '../../utils/string';
import { ScreenIntro, Icon, EmptyState, ReputationSummary, StarDisplay } from '../../components';

export function Ranking({ notify }: { notify: (message: string) => void }) {
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

  async function openProfile(item: any) { 
    setSelected(item); 
    setReputation(null); 
    try { 
      setReputation(await api('/api/usuarios/' + item.userId + '/reputacion')); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos abrir estas valoraciones.'); 
    } 
  }

  return (
    <section className="screen">
      <ScreenIntro kicker="REPUTACIÓN ACADÉMICA" title="Personas que dejan huella" description="Explora colaboradores valorados por quienes recibieron su orientación. La constancia pesa tanto como una buena nota." badge="network" />
      <section className="ranking-search surface-card">
        <div className="search-field">
          <Icon name="search" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filtra por tema: cálculo, inglés, programación…" aria-label="Buscar colaboradores por tema" />
        </div>
        <p><Icon name="shield" /> El orden se ajusta por experiencia para evitar resultados engañosos con una sola valoración.</p>
      </section>
      {loading ? (
        <div className="discovery-loading"><span /><span /><span /></div>
      ) : items.length ? (
        <div className="ranking-list">
          {items.map(item => (
            <button className="ranking-card" key={`${item.userId}-${item.topic}`} onClick={() => openProfile(item)}>
              <span className={`ranking-position${item.position <= 3 ? ' podium' : ''}`}>{item.position <= 3 ? ['🥇','🥈','🥉'][item.position - 1] : `#${item.position}`}</span>
              <span className="ranking-avatar">{initials(item.displayName)}</span>
              <span className="ranking-copy">
                <strong>{item.displayName}</strong>
                <small>{item.topic} · {item.career || 'Comunidad ConectaMentes'}</small>
                <span><StarDisplay value={item.average} /> <b>{Number(item.average).toFixed(1)}</b> · {item.totalRatings} {item.totalRatings === 1 ? 'valoración' : 'valoraciones'}</span>
              </span>
              <span className="ranking-arrow">→</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="Aún no hay valoraciones para este tema" text="El ranking aparecerá cuando se completen y califiquen orientaciones." badge="network" />
      )}
      {selected && (
        <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setSelected(null); }}>
          <section className="custom-dialog reputation-dialog" role="dialog" aria-modal="true" aria-labelledby="reputation-title">
            <div className="custom-dialog-head">
              <span className="dialog-icon"><Icon name="star" /></span>
              <button type="button" className="dialog-close" onClick={() => setSelected(null)} aria-label="Cerrar valoraciones">×</button>
            </div>
            <p className="eyebrow">PERFIL DE COLABORACIÓN</p>
            <h2 id="reputation-title">{selected.displayName}</h2>
            {reputation ? <ReputationSummary reputation={reputation} compact title="Valoraciones recibidas" /> : <p>Cargando valoraciones…</p>}
          </section>
        </div>
      )}
    </section>
  );
}
