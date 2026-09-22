import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { API, api } from '../../shared/api/client';
import { ScreenIntro, CardHeading, IsoBadge, EmptyState, ConfirmDialog, ReputationSummary, ProfileAvatar } from '../../components';

function getSkillConfidenceLabel(confidence: number) {
  switch (Number(confidence)) {
    case 1: return '1/5 · Básico (repaso inicial)';
    case 2: return '2/5 · Intermedio (temas fundamentales)';
    case 3: return '3/5 · Buen dominio (resolución de dudas)';
    case 4: return '4/5 · Nivel avanzado (acompañamiento completo)';
    case 5: return '5/5 · Nivel experto (dominio profundo)';
    default: return `${confidence}/5`;
  }
}

export function Profile({ profile, setProfile, notify, userId, user, setMe, onOpenRanking }: any) {
  const [skill, setSkill] = useState({ topic: '', type: 'Domina', confidence: 4, visible: true });
  const [details, setDetails] = useState({ displayName: user?.displayName ?? '', career: user?.career ?? '', academicTerm: user?.academicTerm ?? '' });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [pendingSkillDelete, setPendingSkillDelete] = useState<any | null>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [ranking, setRanking] = useState<any>(null);

  useEffect(() => { if (userId) api('/api/usuarios/' + userId + '/reputacion').then(setReputation).catch(() => undefined); }, [userId]);
  useEffect(() => { if (userId) api('/api/ranking/me').then(setRanking).catch(() => undefined); }, [userId, reputation?.total]);
  useEffect(() => { setDetails({ displayName: user?.displayName ?? '', career: user?.career ?? '', academicTerm: user?.academicTerm ?? '' }); }, [user?.displayName, user?.career, user?.academicTerm]);
  useEffect(() => { if (!avatarFile) { setAvatarPreview(''); return; } const url = URL.createObjectURL(avatarFile); setAvatarPreview(url); return () => URL.revokeObjectURL(url); }, [avatarFile]);

  async function add(event: FormEvent) { 
    event.preventDefault(); 
    try { 
      await api(editingSkillId ? '/api/perfil/habilidades/' + editingSkillId : '/api/perfil/habilidades', { 
        method: editingSkillId ? 'PUT' : 'POST', 
        body: JSON.stringify({ ...skill, type: 'Domina', confidence: Number(skill.confidence) }) 
      }); 
      setProfile(await api('/api/perfil')); 
      setSkill({ topic: '', type: 'Domina', confidence: 4, visible: true }); 
      setEditingSkillId(null); 
      notify(editingSkillId ? 'Materia de apoyo actualizada.' : 'Materia agregada a tu perfil de orientador.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos guardar el tema.'); 
    } 
  }

  function editSkill(item: any) { 
    setEditingSkillId(item.id); 
    setSkill({ topic: item.topic, type: 'Domina', confidence: item.confidence ?? 4, visible: item.visible ?? true }); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  }

  async function deleteSkill() { 
    if (!pendingSkillDelete) return; 
    const item = pendingSkillDelete; 
    setPendingSkillDelete(null); 
    try { 
      await api('/api/perfil/habilidades/' + item.id, { method: 'DELETE' }); 
      setProfile(await api('/api/perfil')); 
      if (editingSkillId === item.id) { 
        setEditingSkillId(null); 
        setSkill({ topic: '', type: 'Domina', confidence: 4, visible: true }); 
      } 
      notify('Materia eliminada de tus temas de apoyo.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos eliminar la materia.'); 
    } 
  }

  async function saveDetails(event: FormEvent) { 
    event.preventDefault(); 
    setSavingDetails(true); 
    try { 
      const updated = await api('/api/perfil/datos', { method: 'PUT', body: JSON.stringify(details) }); 
      setMe(updated); 
      notify('Datos del perfil actualizados.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos actualizar tu perfil.'); 
    } finally { 
      setSavingDetails(false); 
    } 
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) { 
    const file = event.target.files?.[0]; 
    if (!file) return; 
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { 
      notify('Elige una foto JPG, PNG o WebP.'); 
      return; 
    } 
    if (file.size > 5 * 1024 * 1024) { 
      notify('La foto debe pesar menos de 5 MB.'); 
      return; 
    } 
    setAvatarFile(file); 
  }

  async function saveAvatar() { 
    if (!avatarFile) return; 
    setSavingAvatar(true); 
    try { 
      const form = new FormData(); 
      form.append('file', avatarFile); 
      const updated = await api('/api/perfil/avatar', { method: 'PUT', body: form }); 
      setMe(updated); 
      setAvatarFile(null); 
      notify('Foto de perfil actualizada.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos actualizar tu foto.'); 
    } finally { 
      setSavingAvatar(false); 
    } 
  }

  return (
    <section className="screen">
      <ScreenIntro kicker="MI PERFIL" title="Tu perfil de orientador" description="Registra las materias que dominas para que tus compañeros puedan solicitar tu orientación." badge="book" />
      {reputation && <ReputationSummary reputation={reputation} title="Mi reputación como colaborador" /> }
      <section className="profile-ranking-card surface-card">
        <div className="profile-ranking-copy">
          <p className="eyebrow">MI POSICIÓN</p>
          <h2>Tu lugar en la comunidad</h2>
          <p>{ranking?.position ? `Estás en el puesto ${ranking.position} entre ${ranking.totalParticipants} colaboradores con valoraciones.` : 'Completa una orientación y recibe valoraciones para aparecer en el ranking.'}</p>
        </div>
        <div className="profile-ranking-score" aria-label={ranking?.position ? `Puesto ${ranking.position}` : 'Sin puesto todavía'}>
          <span>{ranking?.position ? `#${ranking.position}` : '—'}</span>
          <small>{ranking?.item ? `${Number(ranking.item.average).toFixed(1)} promedio` : 'Sin valoraciones'}</small>
        </div>
        <button type="button" className="button button-secondary small profile-ranking-action" onClick={onOpenRanking}>Ver top 10</button>
      </section>
      
      <section className="profile-editor surface-card">
        <div className="profile-editor-visual">
          <div className="profile-avatar-frame">
            {avatarPreview ? <img src={avatarPreview} alt="Vista previa de tu foto" /> : <ProfileAvatar userId={userId} name={user?.displayName} version={user?.avatarUpdatedAt} />}
          </div>
          <div>
            <p className="eyebrow">IDENTIDAD VISIBLE</p>
            <h2>Tu presentación</h2>
            <p>Una foto y un nombre claro ayudan a crear conexiones más humanas.</p>
          </div>
        </div>
        <div className="profile-editor-actions">
          <label className="button button-secondary small">
            {avatarFile ? 'Cambiar foto' : 'Elegir foto'}
            <input className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} />
          </label>
          {avatarFile && <button type="button" className="button button-primary small" onClick={saveAvatar} disabled={savingAvatar}>{savingAvatar ? 'Guardando…' : 'Guardar foto'}</button>}
          <small>JPG, PNG o WebP · máximo 5 MB</small>
        </div>
      </section>

      <form className="surface-card profile-details" onSubmit={saveDetails}>
        <CardHeading number="01" title="Editar datos personales" text="Actualiza cómo quieres que te conozca la comunidad." />
        <div className="field-grid">
          <label>Nombre o alias<input value={details.displayName} maxLength={120} onChange={event => setDetails({ ...details, displayName: event.target.value })} required /></label>
          <label>Correo electrónico<input value={user?.email ?? ''} type="email" disabled /><small>El correo es tu identificador de acceso y no se cambia desde aquí.</small></label>
          <label>Carrera o área<input value={details.career} maxLength={160} onChange={event => setDetails({ ...details, career: event.target.value })} required /></label>
          <label>Periodo académico<input value={details.academicTerm} maxLength={80} onChange={event => setDetails({ ...details, academicTerm: event.target.value })} required /></label>
        </div>
        <button className="button button-primary" disabled={savingDetails}>{savingDetails ? 'Guardando cambios…' : 'Guardar cambios'}</button>
      </form>

      <div className="content-grid">
        <form className="surface-card form-surface" onSubmit={add}>
          <CardHeading number="02" title={editingSkillId ? "Editar materia de apoyo" : "Ofrecer apoyo en una materia"} text={editingSkillId ? "Actualiza tu nivel de dominio en este conocimiento." : "Registra las materias en las que puedes orientar o brindar apoyo a otros compañeros."} />
          <div className="skill-badge-note">
            <span className="skill-role-badge">🎓 Rol: Orientador / Tutor</span>
            <small>Esta sección es para registrar los temas que dominas y en los que puedes guiar a otros estudiantes.</small>
          </div>
          <label>Materia o tema que dominas<input value={skill.topic} onChange={event => setSkill({ ...skill, topic: event.target.value })} placeholder="Ej. Bases de datos, Cálculo diferencial, Python…" required /></label>
          <div className="confidence-level-block">
            <div className="confidence-level-header">
              <label htmlFor="skill-confidence">Nivel de dominio o confianza</label>
              <span className="confidence-tag">{getSkillConfidenceLabel(skill.confidence)}</span>
            </div>
            <input id="skill-confidence" type="range" min="1" max="5" value={skill.confidence} onChange={event => setSkill({ ...skill, confidence: Number(event.target.value) })} />
            <div className="confidence-scale-labels"><span>1 · Básico</span><span>3 · Buen dominio</span><span>5 · Nivel experto</span></div>
          </div>
          <div className="form-actions">
            <button className="button button-primary">{editingSkillId ? "Guardar cambios" : "Agregar a mis materias de apoyo"}</button>
            {editingSkillId && <button type="button" className="button button-ghost" onClick={() => { setEditingSkillId(null); setSkill({ topic: "", type: "Domina", confidence: 4, visible: true }); }}>Cancelar</button>}
          </div>
        </form>

        <section className="surface-card">
          <CardHeading number="03" title="Mis materias para orientar" text={`${profile.habilidades?.length ?? 0} materias registradas`} />
          <div className="skill-list">
            {profile.habilidades?.length ? profile.habilidades.map((item: any) => (
              <article className="skill-row" key={item.id}>
                <IsoBadge kind="book" />
                <div><strong>{item.topic}</strong><span>Puedo orientar · {getSkillConfidenceLabel(item.confidence ?? 4)}</span></div>
                <span className="confidence">{item.confidence ?? 4}/5</span>
                <div className="skill-row-actions">
                  <button type="button" className="button button-secondary small" onClick={() => editSkill(item)}>Editar</button>
                  <button type="button" className="button button-danger small" onClick={() => setPendingSkillDelete(item)}>Eliminar</button>
                </div>
              </article>
            )) : <EmptyState title="Aún no has registrado materias" text="Agrega los temas que dominas para que los compañeros que busquen apoyo puedan encontrarte y solicitar tu orientación." badge="book" />}
          </div>
        </section>
      </div>
      {pendingSkillDelete && <ConfirmDialog title="¿Eliminar esta materia?" message={`Se quitará “${pendingSkillDelete.topic}” de tus materias de apoyo. Ya no aparecerás en las sugerencias para este tema.`} confirmLabel="Eliminar materia" onConfirm={deleteSkill} onCancel={() => setPendingSkillDelete(null)} />}
    </section>
  );
}
