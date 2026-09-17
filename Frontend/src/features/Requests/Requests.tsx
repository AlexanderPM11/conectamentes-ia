import { useState, useEffect, FormEvent } from 'react';
import { api } from '../../shared/api/client';
import { ScreenIntro, CardHeading, IsoBadge, Icon, EmptyState } from '../../components';

function humanStatus(status: unknown) { return String(status ?? 'abierta').replaceAll('_', ' ').replace(/^./, value => value.toUpperCase()); }

export function Requests({ requests, form, setForm, submit, calculate }: any) {
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
          <CardHeading number="01" title="Nueva solicitud" text="Solo dos campos. Escribe lo que necesitas o toca el botón flotante de IA." />

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
                  <button type="button" className="button button-secondary small" onClick={() => calculate(item.id)}>
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
