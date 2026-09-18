import { useState, useEffect, useRef, useCallback, Fragment, ChangeEvent, FormEvent } from 'react';
import { API, api } from '../../shared/api/client';
import { initials } from '../../utils/string';
import { ScreenIntro, Icon, IsoBadge, EmptyState, ConfirmDialog, ProfileAvatar } from '../../components';

const CHAT_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function mergeMessage(list: any[], newItem: any) { const i = list.findIndex(m => m.id === newItem.id); if (i >= 0) { const copy = [...list]; copy[i] = newItem; return copy; } return [...list, newItem]; }
function dominicanDateKey(isoDate: string) { return new Date(isoDate).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }); }
function formatChatDayDivider(isoDate: string) { const d = new Date(isoDate); const today = new Date(); const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); return isToday ? 'Hoy' : d.toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'long', day: 'numeric', month: 'long' }); }
function formatDominicanTime(isoDate: string) { return new Date(isoDate).toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo', hour: 'numeric', minute: '2-digit', hour12: true }); }
function formatRelative(isoDate: string) { const now = new Date(); const d = new Date(isoDate); const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000); if (diffMin < 1) return 'ahora'; if (diffMin < 60) return `${diffMin} min`; const diffHrs = Math.floor(diffMin / 60); if (diffHrs < 24) return `${diffHrs} h`; const diffDays = Math.floor(diffHrs / 24); if (diffDays < 7) return `${diffDays} d`; return d.toLocaleDateString('es-DO'); }
function formatFileSize(bytes: number) { if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB'; }
function isImageFile(file: File) { return file.type.startsWith('image/') || IMAGE_EXTENSIONS.some(extension => file.name.toLowerCase().endsWith(extension)); }
async function openChatAttachment(attachment: any) { const token = localStorage.getItem('conectamente_token'); const response = await fetch(`${API}/api/adjuntos/${attachment.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (!response.ok) throw new Error('El archivo no está disponible.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = attachment.fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }

export function Messages({ connections, selectedId, setSelectedId, messagesByConnection, setMessagesByConnection, realtimeConnected, notify, navigate, onlineUsers }: any) {
  const active = connections.filter((item: any) => item.status === 'Activa' || item.status === 1);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [lightboxAttachment, setLightboxAttachment] = useState<any | null>(null);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = messagesScrollRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight + 10000,
        behavior
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 900 && !selectedId && active[0]) {
      setSelectedId(active[0].id);
    }
  }, [active.length, selectedId, setSelectedId]);

  const currentId = active.some((item: any) => item.id === selectedId)
    ? selectedId
    : (typeof window !== 'undefined' && window.innerWidth >= 900 ? (active[0]?.id ?? '') : '');
  const current = active.find((item: any) => item.id === currentId);
  const messages = currentId ? (messagesByConnection[currentId] ?? []) : [];
  const isCurrentOnline = Boolean(current?.counterpartId && onlineUsers?.has(current.counterpartId));

  useEffect(() => {
    if (!currentId || messagesByConnection[currentId]) return;
    api('/api/conexiones/' + currentId + '/mensajes')
      .then(items => setMessagesByConnection((value: any) => ({ ...value, [currentId]: items })))
      .catch((error: unknown) => notify(error instanceof Error ? error.message : 'No pudimos abrir la conversación.'));
  }, [currentId]);

  useEffect(() => {
    if (!currentId) return;

    scrollToBottom('auto');

    const frame = requestAnimationFrame(() => {
      scrollToBottom('auto');
      const frame2 = requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
      return () => cancelAnimationFrame(frame2);
    });

    const t1 = setTimeout(() => scrollToBottom('auto'), 50);
    const t2 = setTimeout(() => scrollToBottom('auto'), 150);
    const t3 = setTimeout(() => scrollToBottom('auto'), 320);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [currentId, scrollToBottom]);

  useEffect(() => {
    if (!currentId || !messages.length) return;
    scrollToBottom('auto');
    const timer = setTimeout(() => scrollToBottom('auto'), 50);
    return () => clearTimeout(timer);
  }, [messages.length, currentId, scrollToBottom]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const handleViewportResize = () => {
      scrollToBottom('auto');
    };
    const vv = window.visualViewport;
    vv.addEventListener('resize', handleViewportResize);
    return () => vv.removeEventListener('resize', handleViewportResize);
  }, [scrollToBottom]);

  useEffect(() => {
    const input = draftInput.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
    input.style.overflowY = input.scrollHeight > 128 ? 'auto' : 'hidden';
  }, [draft]);

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setSelectedFile(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CHAT_FILE_BYTES) {
      notify('El archivo supera el límite de 10 MB.');
      event.target.value = '';
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(isImageFile(file) ? URL.createObjectURL(file) : '');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if ((!draft.trim() && !selectedFile) || !currentId) return;
    setSending(true);
    try {
      let message;
      if (selectedFile) {
        const data = new FormData();
        data.append('file', selectedFile);
        data.append('caption', draft.trim());
        message = await api('/api/conexiones/' + currentId + '/adjuntos', { method: 'POST', body: data });
      } else {
        message = await api('/api/conexiones/' + currentId + '/mensajes', { method: 'POST', body: JSON.stringify({ text: draft }) });
      }
      setMessagesByConnection((value: any) => ({ ...value, [currentId]: mergeMessage(value[currentId] ?? [], message) }));
      setDraft('');
      clearFile();
      setTimeout(() => scrollToBottom('smooth'), 40);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No pudimos enviar el mensaje.');
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage() {
    if (!pendingDelete || !currentId || deleting) return;
    setDeleting(true);
    try {
      await api(`/api/conexiones/${currentId}/mensajes/${pendingDelete.id}`, { method: 'DELETE' });
      setMessagesByConnection((value: any) => ({
        ...value,
        [currentId]: (value[currentId] ?? []).filter((message: any) => message.id !== pendingDelete.id)
      }));
      notify('Mensaje eliminado.');
      setPendingDelete(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No pudimos eliminar el mensaje.');
    } finally {
      setDeleting(false);
    }
  }

  const filteredActive = active.filter((item: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (item.counterpart && item.counterpart.toLowerCase().includes(q)) ||
           (item.topic && item.topic.toLowerCase().includes(q));
  });

  if (!active.length) {
    return (
      <section className="screen">
        <ScreenIntro kicker="BANDEJA SOCIAL" title="Tus mensajes" description="Toca una conexión para abrir la conversación y seguir aprendiendo juntos." badge="chat" />
        <EmptyState title="Tus conversaciones aparecerán aquí" text="Cuando ambos acepten una conexión, el chat se activará automáticamente." badge="chat" />
      </section>
    );
  }

  const isMobileConversationOpen = Boolean(currentId);

  return (
    <section className={`screen chat-screen ${isMobileConversationOpen ? 'chat-active-mobile' : 'chat-inbox-mobile'}`}>
      {!isMobileConversationOpen && (
        <ScreenIntro kicker="BANDEJA SOCIAL" title="Tus mensajes" description="Toca una conversación para abrir el chat y seguir aprendiendo juntos." badge="chat" />
      )}

      <div className={`chat-layout ${isMobileConversationOpen ? 'showing-conversation' : 'showing-inbox'}`}>
        <aside className="conversation-list">
          <div className="conversation-heading">
            <div>
              <p className="eyebrow">CONVERSACIONES</p>
              <span>{active.length} {active.length === 1 ? 'conexión activa' : 'conexiones activas'}</span>
            </div>
            <i className={realtimeConnected ? 'live-indicator' : 'live-indicator offline'}>
              {realtimeConnected ? 'en vivo' : 'reconectando'}
            </i>
          </div>

          <div className="conversation-search">
            <Icon name="search" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por compañero o tema…"
              aria-label="Buscar conversaciones"
            />
            {searchQuery && (
              <button type="button" className="clear-search" onClick={() => setSearchQuery('')} aria-label="Limpiar búsqueda">×</button>
            )}
          </div>

          <div className="social-rail" aria-label="Contactos recientes">
            {filteredActive.map((item: any, index: number) => (
              <button
                className={item.id === currentId ? 'social-story selected' : 'social-story'}
                key={item.id}
                onClick={() => { clearFile(); setSelectedId(item.id); }}
                aria-label={`Abrir conversación con ${item.counterpart}`}
              >
                <span className={`story-ring story-tone-${index % 4}`}>
                  <ProfileAvatar userId={item.counterpartId} name={item.counterpart} version={item.counterpartAvatarUpdatedAt} className="chat-story-avatar" />
                  <i />
                </span>
                <small>{(item.counterpart || 'CM').split(' ')[0]}</small>
              </button>
            ))}
          </div>

          <div className="contact-list" role="list">
            {filteredActive.length ? (
              filteredActive.map((item: any, index: number) => {
                const itemMessages = messagesByConnection[item.id] ?? [];
                const lastMsg = itemMessages[itemMessages.length - 1];
                const snippet = lastMsg
                  ? (lastMsg.text || (lastMsg.attachment ? `📎 ${lastMsg.attachment.fileName}` : 'Archivo adjunto'))
                  : (item.topic || 'Conexión lista para conversar');
                const timeLabel = lastMsg ? formatRelative(lastMsg.createdAt) : 'Nueva conexión';
                const isSelected = item.id === currentId;

                const isItemOnline = Boolean(item.counterpartId && onlineUsers?.has(item.counterpartId));

                return (
                  <button
                    key={item.id}
                    className={`conversation-item ${isSelected ? 'active' : ''}`}
                    onClick={() => { clearFile(); setSelectedId(item.id); }}
                  >
                      <span className="contact-avatar">
                        <ProfileAvatar userId={item.counterpartId} name={item.counterpart} version={item.counterpartAvatarUpdatedAt} className={`contact-avatar-core story-tone-${index % 4}`} />
                        <i className={`status-dot ${isItemOnline ? 'online' : 'offline'}`} />
                      </span>
                    <span className="contact-copy">
                      <span className="contact-copy-top">
                        <strong>{item.counterpart}</strong>
                        <time>{timeLabel}</time>
                      </span>
                      <small>{snippet}</small>
                      <em>{item.topic}</em>
                    </span>
                    <b aria-hidden="true">›</b>
                  </button>
                );
              })
            ) : (
              <p className="contacts-empty">No se encontraron conversaciones con esa búsqueda.</p>
            )}
          </div>
        </aside>

        {current ? (
          <section className="chat-card">
            <header className="chat-card-header">
              <div className="chat-card-header-left">
                <button
                  type="button"
                  className="chat-back-button"
                  onClick={() => { clearFile(); setSelectedId(''); }}
                  aria-label="Volver a la lista de mensajes"
                  title="Volver"
                >
                  <Icon name="back" />
                </button>
                <div className="chat-person">
                  <div className="chat-avatar-wrapper">
                    <ProfileAvatar userId={current?.counterpartId} name={current?.counterpart} version={current?.counterpartAvatarUpdatedAt} className="chat-avatar" />
                    <i className={`avatar-status-dot ${isCurrentOnline ? 'online' : 'offline'}`} aria-hidden="true" />
                  </div>
                  <div className="chat-person-details">
                    <strong>{current?.counterpart}</strong>
                    <small>
                      <span>{current?.topic}</span>
                      <span className={`presence-text ${isCurrentOnline ? 'online' : 'offline'}`}>
                        {isCurrentOnline ? ' · en línea' : ' · desconectado'}
                      </span>
                    </small>
                  </div>
                </div>
              </div>
              <div className="chat-card-header-right">
                <span className="safe-chat" title="Espacio seguro y monitoreado">
                  <Icon name="shield" /> <span>espacio cuidado</span>
                </span>
              </div>
            </header>

            <div className="messages-scroll" ref={messagesScrollRef} aria-live="polite">
              {messages.length ? (
                messages.map((item: any, index: number) => {
                  const prev = messages[index - 1];
                  const currentDateKey = dominicanDateKey(item.createdAt);
                  const prevDateKey = prev ? dominicanDateKey(prev.createdAt) : null;
                  const showDateDivider = currentDateKey !== prevDateKey;
                  const isSameSenderAsPrev = prev && prev.isMine === item.isMine && !showDateDivider;

                  return (
                    <Fragment key={item.id}>
                      {showDateDivider && (
                        <div className="chat-date-divider" role="separator">
                          <span>{formatChatDayDivider(item.createdAt)}</span>
                        </div>
                      )}
                      <article className={`message-bubble ${item.isMine ? 'mine' : 'theirs'} ${isSameSenderAsPrev ? 'consecutive' : ''}`}>
                        {item.isMine && (
                          <button type="button" className="message-delete-button" onClick={() => setPendingDelete(item)} aria-label="Eliminar mensaje" title="Eliminar mensaje">×</button>
                        )}
                        {item.attachment && (
                          item.attachment.contentType?.startsWith('image/')
                            ? <ProtectedChatImage attachment={item.attachment} notify={notify} onImageLoaded={() => scrollToBottom('auto')} onOpen={() => setLightboxAttachment(item.attachment)} />
                            : <button className="document-attachment" onClick={() => openChatAttachment(item.attachment).catch((error: Error) => notify(error.message))}>
                                <span className="document-icon">DOC</span>
                                <span>
                                  <strong>{item.attachment.fileName}</strong>
                                  <small>{formatFileSize(item.attachment.sizeBytes)} · Toca para abrir</small>
                                </span>
                                <b>↓</b>
                              </button>
                        )}
                        {item.text && <MessageText text={item.text} />}
                        <div className="message-meta">
                          <time>{formatDominicanTime(item.createdAt)}</time>
                          {item.isMine && <span className="status-ticks" aria-hidden="true">✓✓</span>}
                        </div>
                      </article>
                    </Fragment>
                  );
                })
              ) : (
                <div className="chat-empty">
                  <IsoBadge kind="chat" large />
                  <h2>Comienza la conversación con {current.counterpart}</h2>
                  <p>Saluda, comparte tu duda sobre <strong>{current.topic}</strong> y acuerden el horario para apoyarse.</p>
                </div>
              )}
              <div ref={messagesEnd} />
            </div>

            <form className="message-composer" onSubmit={send}>
              {selectedFile && (
                <div className="attachment-preview">
                  {previewUrl ? <img src={previewUrl} alt="Vista previa del archivo" /> : <span className="document-icon">DOC</span>}
                  <div className="attachment-info">
                    <strong>{selectedFile.name}</strong>
                    <small>{formatFileSize(selectedFile.size)} · máximo 10 MB</small>
                  </div>
                  <button type="button" className="attachment-remove-btn" onClick={clearFile} aria-label="Quitar archivo">×</button>
                </div>
              )}
              <div className="composer-row">
                <input
                  ref={fileInput}
                  className="file-input"
                  type="file"
                  accept={CHAT_FILE_ACCEPT}
                  onChange={chooseFile}
                  aria-label="Seleccionar imagen o documento"
                />
                <button
                  type="button"
                  className="attach-button"
                  onClick={() => fileInput.current?.click()}
                  aria-label="Adjuntar imagen o documento"
                  title="Adjuntar archivo"
                >
                  ＋
                </button>
                <textarea
                  ref={draftInput}
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onFocus={() => {
                    const runSync = () => {
                      const vv = window.visualViewport;
                      if (vv) {
                        document.documentElement.style.setProperty('--chat-vh', `${Math.round(vv.height)}px`);
                        document.documentElement.style.setProperty('--chat-vt', `${Math.round(vv.offsetTop)}px`);
                      }
                      scrollToBottom('smooth');
                    };
                    requestAnimationFrame(runSync);
                    setTimeout(runSync, 80);
                    setTimeout(runSync, 240);
                    setTimeout(runSync, 420);
                  }}
                  onBlur={() => {
                    const runBlurSync = () => {
                      const vv = window.visualViewport;
                      if (vv) {
                        document.documentElement.style.setProperty('--chat-vh', `${Math.round(vv.height)}px`);
                        document.documentElement.style.setProperty('--chat-vt', `${Math.round(vv.offsetTop)}px`);
                      }
                      if (window.scrollY !== 0) window.scrollTo(0, 0);
                    };
                    requestAnimationFrame(runBlurSync);
                    setTimeout(runBlurSync, 120);
                    setTimeout(runBlurSync, 320);
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      send(event);
                    }
                  }}
                  maxLength={1500}
                  rows={1}
                  placeholder={selectedFile ? 'Agrega un comentario al archivo…' : 'Escribe un mensaje…'}
                  aria-label="Mensaje"
                  enterKeyHint="send"
                />
                <button
                  type="submit"
                  className="send-button"
                  disabled={sending || (!draft.trim() && !selectedFile)}
                  aria-label="Enviar mensaje"
                  title="Enviar"
                >
                  {sending ? '…' : '↗'}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <div className="chat-card chat-card-placeholder">
            <EmptyState
              title="Selecciona una conversación"
              text="Elige un compañero de la lista para ver el historial y enviarse mensajes."
              badge="chat"
            />
          </div>
        )}
      </div>
      {lightboxAttachment && <ChatImageLightbox attachment={lightboxAttachment} notify={notify} onClose={() => setLightboxAttachment(null)} />}
      {pendingDelete && <ConfirmDialog title="¿Eliminar este mensaje?" message="Se quitará este mensaje y cualquier archivo adjunto de la conversación. Esta acción no se puede deshacer." confirmLabel={deleting ? 'Eliminando…' : 'Eliminar mensaje'} onConfirm={deleteMessage} onCancel={() => { if (!deleting) setPendingDelete(null); }} />}
    </section>
  );
}

export function ProtectedChatImage({ attachment, notify, onImageLoaded, onOpen }: { attachment: any; notify: (message: string) => void; onImageLoaded?: () => void; onOpen?: () => void }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let objectUrl = '';
    setSrc('');
    const token = localStorage.getItem('conectamente_token');
    fetch(`${API}/api/adjuntos/${attachment.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.blob(); })
      .then(blob => { objectUrl = URL.createObjectURL(blob); if (active) setSrc(objectUrl); })
      .catch(error => { if (active && error.name !== 'AbortError') notify('No pudimos cargar una imagen del chat.'); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id, notify]);
  return <button className="image-attachment" onClick={() => src ? onOpen?.() : openChatAttachment(attachment).catch((error: Error) => notify(error.message))} aria-label={`Ver ${attachment.fileName} en pantalla completa`}>{src ? <img src={src} alt={attachment.fileName} loading="eager" decoding="async" onLoad={() => onImageLoaded?.()} onError={() => notify('No pudimos visualizar esta imagen.')} /> : <span>Cargando imagen…</span>}</button>;
}

function ChatImageLightbox({ attachment, notify, onClose }: { attachment: any; notify: (message: string) => void; onClose: () => void }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let objectUrl = '';
    const token = localStorage.getItem('conectamente_token');
    fetch(`${API}/api/adjuntos/${attachment.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.blob(); })
      .then(blob => { objectUrl = URL.createObjectURL(blob); if (active) setSrc(objectUrl); })
      .catch(error => { if (active && error.name !== 'AbortError') notify('No pudimos abrir esta imagen.'); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id, notify]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="chat-image-lightbox" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="chat-image-lightbox-panel" role="dialog" aria-modal="true" aria-label={`Vista ampliada de ${attachment.fileName}`}>
        <div className="chat-image-lightbox-toolbar">
          <strong>{attachment.fileName}</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar vista ampliada">×</button>
        </div>
        <div className="chat-image-lightbox-content">
          {src ? <img src={src} alt={attachment.fileName} onError={() => notify('No pudimos visualizar esta imagen.')} /> : <span>Cargando imagen…</span>}
        </div>
      </section>
    </div>
  );
}

export function MessageText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <p>{parts.map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part.includes('meet.google.com') ? 'Abrir Google Meet' : part}</a> : part)}</p>;
}
