import { useState, useEffect, FormEvent } from 'react';
import { api } from '../../shared/api/client';
import { 
  dominicanFormToIso, 
  dominicanSessionParts, 
  formatDominicanDate, 
  formatDominicanTime, 
  formatDominicanDateLong, 
  formatDominicanDateTimeCompact 
} from '../../utils/date';
import { requestGoogleCalendarAccess } from '../../utils/google';
import { ScreenIntro, IsoBadge, Icon, CardHeading, EmptyState, ConfirmDialog, ProfileAvatar, StarRating } from '../../components';

function humanStatus(status: unknown) { return String(status ?? 'abierta').replaceAll('_', ' ').replace(/^./, value => value.toUpperCase()); }

export function Agenda({ connections, sessions, setConnections, setSessions, notify }: any) {
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
  
  async function refresh() { 
    const [currentConnections, currentSessions] = await Promise.all([api('/api/conexiones'), api('/api/sesiones')]); 
    setConnections(currentConnections); 
    setSessions(currentSessions); 
  }
  
  async function respond(id: string, accept: boolean) { 
    try { 
      await api('/api/conexiones/' + id + '/responder', { method: 'POST', body: JSON.stringify({ accept }) }); 
      await refresh(); 
      notify(accept ? 'Conexión aceptada. Ya pueden organizar una sesión.' : 'Invitación rechazada.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos responder la invitación.'); 
    } 
  }
  
  async function openRequestPreview(id: string) { 
    setRequestPreviewLoading(true); 
    setRequestPreview({ connectionId: id }); 
    try { 
      setRequestPreview(await api('/api/conexiones/' + id + '/solicitante')); 
    } catch (error) { 
      setRequestPreview(null); 
      notify(error instanceof Error ? error.message : 'No pudimos cargar los detalles de esta persona.'); 
    } finally { 
      setRequestPreviewLoading(false); 
    } 
  }
  
  async function submit(event: FormEvent) { 
    event.preventDefault(); 
    try { 
      const payload = { 
        durationMinutes: Number(form.durationMinutes), 
        date: dominicanFormToIso(form.date, form.hour, form.minute, form.period), 
        mode: form.mode, 
        objective: form.objective.trim() 
      }; 
      if (editingId) {
        await api('/api/sesiones/' + editingId, { method: 'PUT', body: JSON.stringify(payload) }); 
      } else {
        await api('/api/conexiones/' + form.connectionId + '/sesiones', { method: 'POST', body: JSON.stringify(payload) }); 
      }
      await refresh(); 
      setEditingId(null); 
      setForm({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' }); 
      notify(editingId ? 'Encuentro actualizado.' : 'Sesión agendada con una guía inicial.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos guardar el encuentro.'); 
    } 
  }
  
  function editSession(item: any) { 
    const parts = dominicanSessionParts(item.date); 
    setEditingId(item.id); 
    setForm({ 
      connectionId: item.connectionId, 
      date: parts.date, 
      hour: parts.hour, 
      minute: parts.minute, 
      period: parts.period, 
      durationMinutes: item.durationMinutes, 
      mode: item.mode, 
      objective: item.objective 
    }); 
    if (item.meetUrl) notify('Recuerda actualizar también el evento en Google Calendar.'); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  }
  
  async function deleteSession() { 
    if (!pendingDelete) return; 
    const item = pendingDelete; 
    setPendingDelete(null); 
    try { 
      await api('/api/sesiones/' + item.id, { method: 'DELETE' }); 
      await refresh(); 
      if (editingId === item.id) { 
        setEditingId(null); 
        setForm({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' }); 
      } 
      notify('Encuentro eliminado.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos eliminar el encuentro.'); 
    } 
  }
  
  async function createGoogleMeet(item: any) { 
    setMeetingSessionId(item.id); 
    try { 
      const accessToken = await requestGoogleCalendarAccess(); 
      const result = await api('/api/sesiones/' + item.id + '/google-meet', { method: 'POST', body: JSON.stringify({ accessToken }) }); 
      await refresh(); 
      notify(result.pending ? result.message : 'Google Meet creado y compartido automáticamente en el chat.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos crear Google Meet.'); 
    } finally { 
      setMeetingSessionId(null); 
    } 
  }
  
  async function completeSession(item: any) { 
    try { 
      await api('/api/sesiones/' + item.id + '/completar', { method: 'POST' }); 
      await refresh(); 
      notify(item.isRequester ? 'Sesión completada. Ya puedes calificar la orientación.' : 'Sesión marcada como completada.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos completar la sesión.'); 
    } 
  }
  
  const resetForm = () => { 
    setEditingId(null); 
    setForm({ connectionId: '', date: '', hour: '', minute: '00', period: 'PM', durationMinutes: 30, mode: 'virtual', objective: '' }); 
  };

  return <>
    <section className="screen">
      <ScreenIntro kicker="COORDINACIÓN" title="Hazle espacio al aprendizaje" description="Propón una sesión breve, con objetivo claro y confirmación de ambas personas." badge="book" />
      {pending.length > 0 && (
        <section className="invitation-strip">
          <div>
            <p className="eyebrow">INVITACIONES</p>
            <strong>{pending.length} compañero quiere conectar contigo</strong>
          </div>
          {pending.map((item: any) => (
            <article key={item.id}>
              <IsoBadge kind="network" />
              <span><b>{item.counterpart}</b><small>{item.topic}</small></span>
              <button className="button button-secondary small" onClick={() => openRequestPreview(item.id)}>Ver perfil</button>
              <button className="button button-primary small" onClick={() => respond(item.id, true)}>Aceptar</button>
              <button className="button button-ghost small" onClick={() => respond(item.id, false)}>Ahora no</button>
            </article>
          ))}
        </section>
      )}
      
      <div className="content-grid">
        <form className="surface-card form-surface" onSubmit={submit}>
          <CardHeading number="01" title={editingId ? 'Editar encuentro' : 'Proponer sesión'} text={editingId ? 'Actualiza la fecha, el objetivo o la modalidad.' : 'Elige una conexión activa; sin copiar identificadores.'} />
          {active.length ? <>
            <label>Compañero y tema
              <select value={form.connectionId} onChange={event => setForm({ ...form, connectionId: event.target.value })} required disabled={Boolean(editingId)}>
                <option value="">Selecciona una conexión</option>
                {active.map((item: any) => <option key={item.id} value={item.id}>{item.counterpart} · {item.topic}</option>)}
              </select>
            </label>
            <div className="dominican-date-time">
              <label>Fecha (DD/MM/AAAA)
                <input type="text" inputMode="numeric" pattern="(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2])/([0-9]{4})" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} placeholder="16/09/2026" required />
              </label>
              <label>Hora dominicana
                <div className="time-selects">
                  <select value={form.hour} onChange={event => setForm({ ...form, hour: event.target.value })} aria-label="Hora" required>
                    <option value="">Hora</option>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map(hour => <option key={hour} value={hour}>{hour}</option>)}
                  </select>
                  <select value={form.minute} onChange={event => setForm({ ...form, minute: event.target.value })} aria-label="Minutos">
                    <option value="00">00</option>
                    <option value="15">15</option>
                    <option value="30">30</option>
                    <option value="45">45</option>
                  </select>
                  <select value={form.period} onChange={event => setForm({ ...form, period: event.target.value })} aria-label="Periodo">
                    <option value="AM">a. m.</option>
                    <option value="PM">p. m.</option>
                  </select>
                </div>
              </label>
            </div>
            <small className="date-format-hint">Zona horaria de República Dominicana (UTC−4).</small>
            <div className="field-grid">
              <label>Duración
                <select value={form.durationMinutes} onChange={event => setForm({ ...form, durationMinutes: Number(event.target.value) })}>
                  <option value="30">30 minutos</option>
                  <option value="45">45 minutos</option>
                  <option value="60">60 minutos</option>
                </select>
              </label>
              <label>Modalidad
                <select value={form.mode} onChange={event => setForm({ ...form, mode: event.target.value })}>
                  <option value="virtual">Virtual</option>
                  <option value="presencial">Presencial</option>
                </select>
              </label>
            </div>
            <label>Objetivo
              <input value={form.objective} onChange={event => setForm({ ...form, objective: event.target.value })} placeholder="¿Qué quieren conseguir al terminar?" required maxLength={300} />
            </label>
            <div className="form-actions">
              <button className="button button-primary">{editingId ? 'Guardar cambios' : 'Agendar sesión'}</button>
              {editingId && <button type="button" className="button button-ghost" onClick={resetForm}>Cancelar</button>}
            </div>
          </> : <EmptyState title="Primero crea una conexión" text="Acepta una coincidencia y espera la confirmación del compañero para poder agendar." badge="network" />}
        </form>

        <section className="timeline-card">
          <CardHeading number="02" title="Próximos encuentros" text={`${upcomingSessions.length} ${upcomingSessions.length === 1 ? 'encuentro próximo' : 'encuentros próximos'}`} />
          {upcomingSessions.length ? (
            <div className="session-list">
              {upcomingSessions.map((item: any) => (
                <article key={item.id}>
                  <div className="session-date">
                    <strong>{formatDominicanDate(item.date)}</strong>
                    <span>{formatDominicanTime(item.date)}</span>
                  </div>
                  <div className="session-info">
                    <b>{item.objective}</b>
                    <p>{formatDominicanDateLong(item.date)} · {item.durationMinutes} min · {item.mode}</p>
                    <small>{connections.find((connection: any) => connection.id === item.connectionId)?.counterpart ?? 'Conexión de aprendizaje'}</small>
                  </div>
                  <span className="status-pill">{humanStatus(item.status)}</span>
                  <div className="session-actions">
                    {String(item.mode).toLowerCase() === 'virtual' && (
                      item.meetUrl 
                        ? <a className="button meet-button small" href={item.meetUrl} target="_blank" rel="noreferrer">Entrar a Meet</a> 
                        : <button type="button" className="button meet-button small" disabled={meetingSessionId === item.id} onClick={() => createGoogleMeet(item)}>{meetingSessionId === item.id ? 'Creando…' : 'Crear Google Meet'}</button>
                    )}
                    <button type="button" className="button button-secondary small" onClick={() => editSession(item)}>Editar</button>
                    <button type="button" className="button button-danger small" onClick={() => setPendingDelete(item)}>Eliminar</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <ol className="timeline">
              <li><span>1</span><div><strong>Elige a tu compañero</strong><p>Solo aparecen conexiones confirmadas.</p></div></li>
              <li><span>2</span><div><strong>Define un objetivo</strong><p>Una meta pequeña y concreta.</p></div></li>
              <li><span>3</span><div><strong>Recibe una guía</strong><p>Pasos sugeridos para enfocarse.</p></div></li>
            </ol>
          )}
        </section>
      </div>

      <section className="session-history surface-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">EXPERIENCIAS COMPARTIDAS</p>
            <h2>Historial y valoraciones</h2>
          </div>
          <span className="count-badge">{historySessions.length}</span>
        </div>
        {historySessions.length ? (
          <div className="history-list">
            {historySessions.map((item: any) => { 
              const scheduled = item.status === 'Agendada' || item.status === 0; 
              const completed = item.status === 'Completada' || item.status === 1; 
              return (
                <article key={item.id}>
                  <span className="history-icon"><Icon name={completed ? 'star' : 'calendar'} /></span>
                  <span className="history-copy">
                    <strong>{item.topic || item.objective}</strong>
                    <small>{item.counterpart || 'Conexión de aprendizaje'} · {formatDominicanDateTimeCompact(item.date)}</small>
                    <em>{completed ? 'Orientación completada' : humanStatus(item.status)}</em>
                  </span>
                  <span className="history-actions">
                    {scheduled && new Date(item.date).getTime() < Date.now() && <button className="button button-secondary small" onClick={() => completeSession(item)}>Marcar completada</button>}
                    {completed && item.canRate && <button className="button button-primary small" onClick={() => setRatingSession(item)}>Calificar orientación</button>}
                    {completed && item.hasRated && <span className="rated-pill">★ Valorada</span>}
                    {completed && !item.isRequester && <span className="rated-pill neutral">Orientación impartida</span>}
                  </span>
                </article>
              ); 
            })}
          </div>
        ) : <p className="history-empty">Aquí aparecerán las sesiones pasadas y las calificaciones pendientes.</p>}
      </section>
    </section>

    {pendingDelete && <ConfirmDialog title="¿Eliminar este encuentro?" message={`Se quitará de tu agenda: “${pendingDelete.objective}”.${pendingDelete.meetUrl ? ' El evento de Google Calendar debe eliminarse también desde Google.' : ''} Esta acción no se puede deshacer.`} confirmLabel="Eliminar encuentro" onConfirm={deleteSession} onCancel={() => setPendingDelete(null)} />}
    {requestPreview && <RequestPreviewDialog data={requestPreview} loading={requestPreviewLoading} onClose={() => setRequestPreview(null)} onRespond={async accept => { await respond(requestPreview.connectionId, accept); setRequestPreview(null); }} />}
    {ratingSession && <RatingDialog session={ratingSession} onCancel={() => setRatingSession(null)} onSaved={async () => { setRatingSession(null); await refresh(); notify('Gracias. Tu valoración ya forma parte de la reputación del colaborador.'); }} />}
  </>;
}

function RequestPreviewDialog({ data, loading, onClose, onRespond }: { data: any; loading: boolean; onClose: () => void; onRespond: (accept: boolean) => Promise<void> }) {
  const [responding, setResponding] = useState(false);
  
  useEffect(() => { 
    const closeOnEscape = (event: KeyboardEvent) => { 
      if (event.key === 'Escape' && !responding) onClose(); 
    }; 
    document.addEventListener('keydown', closeOnEscape); 
    return () => document.removeEventListener('keydown', closeOnEscape); 
  }, [onClose, responding]);
  
  async function respond(accept: boolean) { 
    setResponding(true); 
    await onRespond(accept); 
    setResponding(false); 
  }
  
  const person = data?.person;
  
  return (
    <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !responding) onClose(); }}>
      <section className="custom-dialog request-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="request-preview-title" aria-describedby="request-preview-description">
        <div className="custom-dialog-head">
          <span className="dialog-icon"><Icon name="match" /></span>
          <button type="button" className="dialog-close" onClick={onClose} disabled={responding} aria-label="Cerrar detalles">×</button>
        </div>
        {loading || !person ? (
          <div className="preview-loading" role="status">
            <span /><span /><span />
            <p>Cargando la presentación de esta persona…</p>
          </div>
        ) : (
          <>
            <div className="request-preview-person">
              <div className="request-preview-avatar">
                <ProfileAvatar userId={person.id} name={person.displayName} version={person.avatarUpdatedAt} />
              </div>
              <div>
                <p className="eyebrow">SOLICITUD DE CONEXIÓN</p>
                <h2 id="request-preview-title">{person.displayName}</h2>
                <p>{person.career} · {person.academicTerm}</p>
              </div>
            </div>
            
            <div className="request-preview-request" id="request-preview-description">
              <span className="soft-label">QUIERE APRENDER SOBRE</span>
              <h3>{data.request.topic}</h3>
              <p>{data.request.description}</p>
              {data.request.desiredSchedule && <small>Disponibilidad indicada: {data.request.desiredSchedule}</small>}
            </div>
            
            <div className="request-preview-grid">
              <div>
                <span className="eyebrow">TEMAS COMPARTIDOS</span>
                {data.skills?.length ? (
                  <div className="preview-chips">
                    {data.skills.map((skill: any) => <span key={skill.topic}>{skill.topic}</span>)}
                  </div>
                ) : <p>Esta persona todavía no ha compartido temas.</p>}
              </div>
              <div>
                <span className="eyebrow">EXPERIENCIA</span>
                <strong className="preview-rating">{data.reputation?.totalRatings ? `★ ${Number(data.reputation.average).toFixed(1)}` : 'Nueva conexión'}</strong>
                <small>{data.reputation?.totalRatings ? `${data.reputation.totalRatings} valoraciones recibidas` : 'Aún no tiene valoraciones'}</small>
              </div>
            </div>
            
            <p className="preview-note"><Icon name="shield" /> Solo mostramos información que la persona decidió compartir.</p>
            
            <div className="custom-dialog-actions">
              <button type="button" className="button button-ghost" onClick={() => respond(false)} disabled={responding}>Ahora no</button>
              <button type="button" className="button button-primary" onClick={() => respond(true)} disabled={responding}>{responding ? 'Procesando…' : 'Aceptar conexión'}</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function RatingDialog({ session, onCancel, onSaved }: { session: any; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ usefulness: 5, clarity: 5, fulfillment: 5, respect: 5, comment: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  useEffect(() => { 
    const handleKeyDown = (event: KeyboardEvent) => { 
      if (event.key === 'Escape' && !saving) onCancel(); 
    }; 
    document.addEventListener('keydown', handleKeyDown); 
    return () => document.removeEventListener('keydown', handleKeyDown); 
  }, [onCancel, saving]);
  
  async function submit(event: FormEvent) { 
    event.preventDefault(); 
    setSaving(true); 
    setError(''); 
    try { 
      await api('/api/sesiones/' + session.id + '/valoraciones', { method: 'POST', body: JSON.stringify(form) }); 
      await onSaved(); 
    } catch (caught) { 
      setError(caught instanceof Error ? caught.message : 'No pudimos guardar tu valoración.'); 
    } finally { 
      setSaving(false); 
    } 
  }
  
  return (
    <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !saving) onCancel(); }}>
      <section className="custom-dialog rating-dialog" role="dialog" aria-modal="true" aria-labelledby="rating-dialog-title">
        <div className="custom-dialog-head">
          <span className="dialog-icon star"><Icon name="star" /></span>
          <button type="button" className="dialog-close" onClick={onCancel} disabled={saving} aria-label="Cerrar valoración">×</button>
        </div>
        <p className="eyebrow">VALORAR ORIENTACIÓN</p>
        <h2 id="rating-dialog-title">¿Cómo fue aprender con {session.counterpart}?</h2>
        <p>Tu opinión se mostrará en su reputación para <strong>{session.topic}</strong>. Evalúa la experiencia académica, no características personales.</p>
        <form onSubmit={submit}>
          <StarRating label="Utilidad" help="¿Te ayudó a avanzar?" value={form.usefulness} onChange={value => setForm({ ...form, usefulness: value })} />
          <StarRating label="Claridad" help="¿Explicó de forma comprensible?" value={form.clarity} onChange={value => setForm({ ...form, clarity: value })} />
          <StarRating label="Cumplimiento" help="¿Respetó lo acordado?" value={form.fulfillment} onChange={value => setForm({ ...form, fulfillment: value })} />
          <StarRating label="Respeto" help="¿Fue una experiencia cuidadosa?" value={form.respect} onChange={value => setForm({ ...form, respect: value })} />
          
          <label>Comentario académico <span className="optional-label">opcional</span>
            <textarea value={form.comment} onChange={event => setForm({ ...form, comment: event.target.value })} maxLength={500} placeholder="Ej. Explicó los ejercicios paso a paso y comprobó que entendiera." />
          </label>
          
          {error && <p className="inline-message" role="alert">{error}</p>}
          
          <div className="custom-dialog-actions">
            <button type="button" className="button button-ghost" onClick={onCancel} disabled={saving}>Ahora no</button>
            <button className="button button-primary" disabled={saving}>{saving ? 'Guardando…' : 'Publicar valoración'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
