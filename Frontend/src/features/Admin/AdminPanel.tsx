import { useState, useEffect, FormEvent } from 'react';
import { api } from '../../shared/api/client';
import { initials } from '../../utils/string';
import { ScreenIntro, Icon, EmptyState } from '../../components';

function adminStatusLabel(status: string) { return status === 'blocked' ? 'Bloqueado' : status === 'suspended' ? 'Suspendido' : 'Activo'; }

export function AdminPanel({ notify }: { notify: (message: string) => void }) {
  const [summary, setSummary] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ user: any; status: string } | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (status) query.set('status', status);
      const [nextSummary, nextUsers, nextReports] = await Promise.all([api('/api/admin/resumen').catch(() => null), api('/api/admin/usuarios?' + query.toString()).catch(() => []), api('/api/moderacion/reportes')]);
      setSummary(nextSummary);
      setUsers(nextUsers);
      setReports(nextReports);
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos cargar la administración.'); 
    } finally { 
      setLoading(false); 
    }
  }
  
  useEffect(() => { refresh(); }, [status]);
  
  async function saveStatus(reason: string) {
    if (!pending) return;
    try { 
      await api('/api/admin/usuarios/' + pending.user.id + '/estado', { method: 'POST', body: JSON.stringify({ status: pending.status, reason }) }); 
      setPending(null); 
      await refresh(); 
      notify('Estado de la cuenta actualizado.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos actualizar la cuenta.'); 
    }
  }
  
  return (
    <section className="screen admin-screen">
      <ScreenIntro kicker="CONTROL DEL SISTEMA" title="Tu comunidad, bajo control" description="Gestiona accesos con trazabilidad, contexto y el mismo cuidado que esperamos en cada conexión." badge="network" />
      <div className="admin-guard">
        <span className="admin-guard-icon"><Icon name="shield" /></span>
        <div>
          <strong>Sesión de superadministrador</strong>
          <p>Solo este rol puede cambiar el acceso de otras cuentas.</p>
        </div>
        <span className="status-pill active">Protegido</span>
      </div>
      <div className="admin-metrics">
        {[['Usuarios registrados', summary?.total ?? '—', 'total'], ['Activos', summary?.activos ?? '—', 'active'], ['Suspendidos', summary?.suspendidos ?? '—', 'suspended'], ['Bloqueados', summary?.bloqueados ?? '—', 'blocked']].map(([label, value, key]) => (
          <button key={String(key)} className="admin-metric" onClick={() => setStatus(key === 'total' ? '' : String(key))}>
            <span>{label}</span>
            <strong>{value as React.ReactNode}</strong>
            <small>{key === 'total' ? `${summary?.nuevosUltimos30Dias ?? 0} nuevos en 30 días` : 'Ver cuentas'}</small>
          </button>
        ))}
      </div>
      <section className="surface-card reports-card">
        <div className="section-heading compact">
          <div><p className="eyebrow">REVISIÓN HUMANA</p><h2>Reportes de la comunidad</h2><p>Lee el contexto y la evidencia antes de decidir si corresponde una intervención.</p></div>
          <span className="count-badge">{reports.filter(report => report.status === 'Abierto').length}</span>
        </div>
        {reports.length ? <div className="report-list">{reports.map(report => <button type="button" className="report-row" key={report.id} onClick={() => setSelectedReport(report)}>
          <span className={`report-status ${report.status.toLowerCase()}`}>{report.status === 'Abierto' ? 'Abierto' : report.status === 'EnRevision' ? 'En revisión' : 'Resuelto'}</span>
          <span className="report-row-copy"><strong>{report.reason}</strong><small>{report.reportedName} · enviado por {report.authorName}</small><em>{new Date(report.createdAt).toLocaleDateString('es-ES')}</em></span>
          <span className="report-evidence-count">{report.evidences?.length ? `📎 ${report.evidences.length}` : '›'}</span>
        </button>)}</div> : <p className="history-empty">No hay reportes para revisar.</p>}
      </section>
      <section className="surface-card admin-users-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">DIRECTORIO</p>
            <h2>Personas registradas</h2>
            <p>Busca por nombre, correo o carrera. Las restricciones siempre llevan un motivo visible al iniciar sesión.</p>
          </div>
          <span className="count-badge">{users.length}</span>
        </div>
        <form className="admin-filters" onSubmit={event => { event.preventDefault(); refresh(); }}>
          <label className="search-field">
            <Icon name="search" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar usuario…" aria-label="Buscar usuario" />
          </label>
          <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="suspended">Suspendidos</option>
            <option value="blocked">Bloqueados</option>
          </select>
          <button className="button button-primary small">Buscar</button>
        </form>
        {loading ? <p className="history-empty">Cargando directorio…</p> : users.length ? (
          <div className="admin-user-list">
            {users.map(user => (
              <article className="admin-user-row" key={user.id}>
                <span className="admin-avatar">{initials(user.displayName)}</span>
                <div className="admin-user-copy">
                  <strong>{user.displayName}</strong>
                  <span>{user.email}</span>
                  <small>{user.career} · {user.academicTerm}</small>
                  {user.accessStatusReason && <em>Motivo: {user.accessStatusReason}</em>}
                </div>
                <span className={`status-pill ${user.accessStatus}`}>{adminStatusLabel(user.accessStatus)}</span>
                <div className="admin-user-actions">
                  {user.accessStatus !== 'active' && <button className="button button-secondary small" onClick={() => setPending({ user, status: 'active' })}>Reactivar</button>}
                  {user.accessStatus !== 'suspended' && <button className="button button-secondary small" onClick={() => setPending({ user, status: 'suspended' })}>Suspender</button>}
                  {user.accessStatus !== 'blocked' && <button className="button button-danger small" onClick={() => setPending({ user, status: 'blocked' })}>Bloquear</button>}
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No encontramos cuentas" text="Prueba con otro nombre, correo o filtro." badge="network" />}
      </section>
      {pending && <AdminAccessDialog user={pending.user} status={pending.status} onCancel={() => setPending(null)} onSave={saveStatus} />}
      {selectedReport && <ReportReviewDialog report={selectedReport} onCancel={() => setSelectedReport(null)} onSaved={async () => { setSelectedReport(null); await refresh(); }} notify={notify} />}
    </section>
  );
}

function ReportReviewDialog({ report, onCancel, onSaved, notify }: { report: any; onCancel: () => void; onSaved: () => Promise<void>; notify: (message: string) => void }) {
  const [status, setStatus] = useState(report.status);
  const [note, setNote] = useState(report.resolutionNote ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && !saving && onCancel(); document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [onCancel, saving]);
  async function save(event: FormEvent) { event.preventDefault(); if (status === 'Resuelto' && !note.trim()) return; setSaving(true); try { await api(`/api/moderacion/reportes/${report.id}`, { method: 'PUT', body: JSON.stringify({ status, resolutionNote: note }) }); notify('Estado del reporte actualizado.'); await onSaved(); } catch (error) { notify(error instanceof Error ? error.message : 'No pudimos guardar la revisión.'); } finally { setSaving(false); } }
  return <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => event.currentTarget === event.target && !saving && onCancel()}><section className="custom-dialog report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title"><div className="custom-dialog-head"><span className="dialog-icon report"><Icon name="shield" /></span><button type="button" className="dialog-close" onClick={onCancel} disabled={saving} aria-label="Cerrar">×</button></div><p className="eyebrow">DETALLE DEL REPORTE</p><h2 id="report-dialog-title">{report.reason}</h2><p><strong>{report.reportedName}</strong> · reportado por {report.authorName}</p><div className="report-detail"><span>Qué ocurrió</span><p>{report.description}</p></div>{report.evidences?.length > 0 && <div className="report-evidence"><span>Evidencia adjunta</span>{report.evidences.map((evidence: any) => <EvidencePreview key={evidence.id} reportId={report.id} evidence={evidence} notify={notify} />)}</div>}<form onSubmit={save}><label>Estado de revisión<select value={status} onChange={event => setStatus(event.target.value)}><option value="Abierto">Abierto</option><option value="EnRevision">En revisión</option><option value="Resuelto">Resuelto</option></select></label><label>Nota de resolución<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} placeholder="Registra la decisión humana y los próximos pasos." /></label><div className="custom-dialog-actions"><button type="button" className="button button-ghost" onClick={onCancel} disabled={saving}>Cancelar</button><button className="button button-primary" disabled={saving || (status === 'Resuelto' && !note.trim())}>{saving ? 'Guardando…' : 'Guardar revisión'}</button></div></form></section></div>;
}

function EvidencePreview({ reportId, evidence, notify }: { reportId: string; evidence: any; notify: (message: string) => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const controller = new AbortController(); const token = localStorage.getItem('conectamente_token'); fetch(`/api/moderacion/reportes/${reportId}/evidencias/${evidence.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal }).then(response => { if (!response.ok) throw new Error('No pudimos abrir la evidencia.'); return response.blob(); }).then(blob => setUrl(URL.createObjectURL(blob))).catch(error => { if (error.name !== 'AbortError') notify(error.message); }); return () => { controller.abort(); if (url) URL.revokeObjectURL(url); }; }, [reportId, evidence.id]);
  return <div className="evidence-item">{url && evidence.contentType?.startsWith('image/') ? <img src={url} alt={evidence.fileName} /> : <span className="evidence-file">📎</span>}<span><strong>{evidence.fileName}</strong><small>{Math.ceil(evidence.sizeBytes / 1024)} KB</small></span>{url && <a href={url} target="_blank" rel="noreferrer">Abrir</a>}</div>;
}

function AdminAccessDialog({ user, status, onCancel, onSave }: { user: any; status: string; onCancel: () => void; onSave: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState(''); 
  const [saving, setSaving] = useState(false); 
  const requiresReason = status !== 'active';
  
  useEffect(() => { 
    const close = (event: KeyboardEvent) => { 
      if (event.key === 'Escape' && !saving) onCancel(); 
    }; 
    document.addEventListener('keydown', close); 
    return () => document.removeEventListener('keydown', close); 
  }, [onCancel, saving]);
  
  async function submit(event: FormEvent) { 
    event.preventDefault(); 
    if (requiresReason && !reason.trim()) return; 
    setSaving(true); 
    try { 
      await onSave(reason); 
    } finally { 
      setSaving(false); 
    } 
  }
  
  const action = status === 'blocked' ? 'bloquear' : status === 'suspended' ? 'suspender' : 'reactivar';
  
  return (
    <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !saving) onCancel(); }}>
      <section className="custom-dialog admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
        <div className="custom-dialog-head">
          <span className={`dialog-icon ${status}`}><Icon name="shield" /></span>
          <button type="button" className="dialog-close" onClick={onCancel} disabled={saving} aria-label="Cerrar">×</button>
        </div>
        <p className="eyebrow">GESTIÓN DE ACCESO</p>
        <h2 id="admin-dialog-title">¿Quieres {action} esta cuenta?</h2>
        <p><strong>{user.displayName}</strong> · {user.email}</p>
        {requiresReason ? (
          <label>Motivo de la decisión
            <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required placeholder="Explica de forma clara qué ocurrió y qué debe saber la persona." />
            <small>{reason.length}/500 · Este mensaje aparecerá al intentar iniciar sesión.</small>
          </label>
        ) : <p className="dialog-note">La persona podrá volver a iniciar sesión. Su motivo anterior quedará retirado.</p>}
        
        <div className="custom-dialog-actions">
          <button type="button" className="button button-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className={status === 'blocked' ? 'button button-danger' : 'button button-primary'} onClick={submit} disabled={saving || (requiresReason && !reason.trim())}>
            {saving ? 'Guardando…' : `Confirmar ${action}`}
          </button>
        </div>
      </section>
    </div>
  );
}
