import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../shared/api/client';
import { Icon } from '../../components';

type Summary = { plan: string; status: string; messagesUsed: number; messageLimit: number; expiresAt?: string | null; trialAvailable: boolean };
type Conversation = { id: string; subject: string; title: string; lastActivityAt: string };
type Message = { id: string; role: 'User' | 'Assistant' | 0 | 1; content: string; safetyStatus?: string | number; createdAt: string };

export function Tutor({ notify }: { notify: (message: string) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<{ conversation: Conversation; messages: Message[] } | null>(null);
  const [subject, setSubject] = useState('Matemáticas');
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState('explicar');
  const [busy, setBusy] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);

  async function refresh() {
    const [usage, items] = await Promise.all([api<Summary>('/api/tutor/resumen'), api<Conversation[]>('/api/tutor/conversaciones')]);
    setSummary(usage); setConversations(items);
    if (!active && items[0]) await openConversation(items[0]);
  }
  useEffect(() => { refresh().catch(error => notify(error instanceof Error ? error.message : 'No pudimos cargar el tutor.')); }, []);

  async function openConversation(item: Conversation) {
    const result = await api<{ conversation: Conversation; messages: Message[] }>(`/api/tutor/conversaciones/${item.id}`);
    setActive(result);
  }

  async function createConversation() {
    if (!subject.trim()) return;
    const result = await api<Conversation>('/api/tutor/conversaciones', { method: 'POST', body: JSON.stringify({ subject }) });
    setConversations(current => [result, ...current]); setActive({ conversation: result, messages: [] });
  }

  async function send(event: FormEvent) {
    event.preventDefault(); if (!draft.trim() || !active || busy) return;
    setBusy(true);
    try {
      const result = await api<{ userMessage: Message; assistant: Message; usage: Summary }>(`/api/tutor/conversaciones/${active.conversation.id}/mensajes`, { method: 'POST', body: JSON.stringify({ content: draft, mode }) });
      setActive(current => current ? { ...current, messages: [...current.messages, result.userMessage, result.assistant] } : current);
      setSummary(result.usage); setDraft('');
    } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos enviar tu mensaje.'); } finally { setBusy(false); }
  }

  async function startTrial() {
    setStartingTrial(true);
    try { const result = await api<Summary>('/api/suscripciones/prueba-premium', { method: 'POST' }); setSummary(result); notify('Tu prueba Premium está activa durante 7 días.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'No pudimos activar la prueba.'); } finally { setStartingTrial(false); }
  }

  const percent = summary ? Math.min(100, Math.round((summary.messagesUsed / summary.messageLimit) * 100)) : 0;
  return <section className="tutor-screen">
    <header className="tutor-hero">
      <div><p className="eyebrow">APRENDER A TU RITMO</p><h1>Tu Tutor IA</h1><p>Entiende, practica y avanza con una guía que te hace pensar.</p></div>
      <div className="tutor-orbit" aria-hidden="true"><span>✦</span><i>?</i><b>+</b></div>
    </header>
    <div className="tutor-layout">
      <aside className="tutor-sidebar card">
        <div className="tutor-plan"><div><span className="plan-kicker">PLAN ACTUAL</span><strong>{summary?.plan ?? 'Free'}</strong></div><span className="plan-badge">{summary?.plan === 'Premium' ? 'PRO' : 'BASE'}</span></div>
        <div className="usage-copy"><span>Uso mensual</span><b>{summary?.messagesUsed ?? 0}/{summary?.messageLimit ?? 15}</b></div><div className="usage-bar"><i style={{ width: `${percent}%` }} /></div>
        {summary?.plan !== 'Premium' && <div className="premium-card"><span className="sparkle">✦</span><strong>Desbloquea tu mejor forma de estudiar</strong><p>Más práctica, planes personalizados y memoria de tu progreso.</p><button className="button button-primary small" onClick={startTrial} disabled={startingTrial}>{startingTrial ? 'Activando…' : 'Probar Premium 7 días'}</button></div>}
        <div className="tutor-new"><label htmlFor="tutor-subject">Nueva tutoría</label><div className="tutor-subject-row"><input id="tutor-subject" value={subject} onChange={event => setSubject(event.target.value)} placeholder="Materia" /><button className="button button-secondary small" onClick={createConversation}>Crear</button></div></div>
        <div className="conversation-heading"><span>Historial</span><small>{conversations.length} conversaciones</small></div>
        <div className="tutor-conversations">{conversations.map(item => <button key={item.id} className={`tutor-conversation ${active?.conversation.id === item.id ? 'active' : ''}`} onClick={() => openConversation(item)}><strong>{item.title}</strong><small>{item.subject}</small></button>)}{!conversations.length && <p className="tutor-empty">Crea tu primera tutoría para comenzar.</p>}</div>
      </aside>
      <div className="tutor-chat card">
        {!active ? <div className="tutor-welcome"><span className="tutor-welcome-icon"><Icon name="tutor" /></span><p className="eyebrow">TU ESPACIO DE ESTUDIO</p><h2>¿Qué quieres comprender hoy?</h2><p>Elige una materia y escribe tu primera pregunta. El tutor te acompañará paso a paso.</p><button className="button button-primary" onClick={createConversation}>Comenzar tutoría</button></div> : <>
          <header className="tutor-chat-header"><div><span className="eyebrow">{active.conversation.subject}</span><h2>{active.conversation.title}</h2></div><div className="mode-pills">{[['explicar','Explicar'],['practicar','Practicar'],['repasar','Repasar']].map(([value, label]) => <button key={value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}>{label}</button>)}</div></header>
          <div className="tutor-messages">{!active.messages.length && <div className="tutor-starter"><strong>Empieza con una pregunta abierta</strong><span>“Explícame este tema como si fuera la primera vez que lo veo.”</span></div>}{active.messages.map(message => <article key={message.id} className={`tutor-message ${message.role === 'User' || message.role === 0 ? 'user' : 'assistant'}`}><span className="message-label">{message.role === 'User' || message.role === 0 ? 'TÚ' : 'TUTOR IA'}</span><p>{message.content}</p></article>)}</div>
          <form className="tutor-composer" onSubmit={send}><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribe qué quieres aprender…" rows={2} maxLength={4000} /><div><small>El tutor te guía; no hace tareas completas por ti.</small><button className="button button-primary" disabled={busy || !draft.trim()}>{busy ? 'Pensando…' : 'Enviar'}</button></div></form>
        </>}
      </div>
    </div>
  </section>;
}
