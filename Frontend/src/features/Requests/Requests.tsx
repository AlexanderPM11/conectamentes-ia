import { useState, useEffect, FormEvent } from 'react';
import { api } from '../../shared/api/client';
import { ScreenIntro, CardHeading, IsoBadge, Icon, EmptyState, ConfirmDialog } from '../../components';

function humanStatus(status: unknown) { return String(status ?? 'abierta').replaceAll('_', ' ').replace(/^./, value => value.toUpperCase()); }

export function Requests({ requests, form, setForm, submit, calculate, editingRequest, setEditingRequest, deleteRequest }: any) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleEditClick(item: any) {
    setForm({ topic: item.topic, description: item.description, helpType: item.helpType || 'comprender', desiredSchedule: item.desiredSchedule || '' });
    setEditingRequest(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  return (
    <section className="screen">
      <ScreenIntro
        kicker="PEDIR APOYO"
        title="Cuéntanos qué necesitas"
        description="Publica tu duda de forma sencilla o usa el botón flotante con IA para redactarla en segundos."
        badge="chat"
      />
      <div className="content-grid requests-grid">
        <form className="surface-card form-surface simplified-request-form" onSubmit={submit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <CardHeading number="01" title={editingRequest ? "Editar solicitud" : "Nueva solicitud"} text={editingRequest ? "Modifica los detalles de tu solicitud." : "Solo dos campos. Escribe lo que necesitas o toca el botón flotante de IA."} />
            {editingRequest && (
              <button type="button" className="button button-secondary small" onClick={() => { setEditingRequest(null); setForm({ topic: '', description: '', helpType: 'comprender', desiredSchedule: '' }); }}>
                Cancelar edición
              </button>
            )}
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
            {editingRequest ? 'Guardar cambios' : 'Encontrar apoyo'} <span>{editingRequest ? '✓' : '→'}</span>
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
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
                    <button type="button" className="button button-secondary small" onClick={() => calculate(item.id)}>
                      Buscar compañeros <span>→</span>
                    </button>
                    <button type="button" className="button button-secondary small icon-button" title="Editar" onClick={() => handleEditClick(item)} aria-label="Editar solicitud">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button type="button" className="button button-secondary small icon-button" title="Eliminar" onClick={() => setDeletingId(item.id)} aria-label="Eliminar solicitud" style={{ color: 'var(--error)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </div>
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
      {deletingId && (
        <ConfirmDialog
          title="Eliminar solicitud"
          message="¿Estás seguro de que quieres eliminar esta solicitud de apoyo? Esta acción no se puede deshacer."
          confirmLabel="Eliminar solicitud"
          onConfirm={() => {
            deleteRequest(deletingId);
            setDeletingId(null);
          }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </section>
  );
}

export function AiRequestDialog({ open, onClose, onApply, notify }: { open: boolean; onClose: () => void; onApply: (topic: string, description: string) => void; notify: (msg: string) => void }) {
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
            <div className="ai-actions-row" style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button type="button" className="button button-secondary icon-button" onClick={() => setSuggestion(null)} aria-label="Reintentar" title="Volver a escribir">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              </button>
              <button type="button" className="button button-primary icon-button" onClick={handleAccept} aria-label="Aceptar" title="Usar en mi solicitud">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
