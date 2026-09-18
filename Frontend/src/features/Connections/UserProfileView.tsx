import { useState, useEffect } from 'react';
import { api } from '../../shared/api/client';
import { initials } from '../../utils/string';
import { Icon, StarDisplay, ProfileAvatar } from '../../components';

interface UserProfileViewProps {
  userId: string;
  onBack: () => void;
  onConnect: () => void;
  onRequestSupport: (topic: string) => void;
  alreadyConnected: boolean;
}

export function UserProfileView({ userId, onBack, onConnect, onRequestSupport, alreadyConnected }: UserProfileViewProps) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api(`/api/usuarios/${userId}/perfil`)
      .then(data => {
        if (!cancelled) setProfile(data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No pudimos cargar el perfil');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <section className="screen">
        <button className="button button-ghost" onClick={onBack} style={{ alignSelf: 'flex-start', marginBottom: '24px' }}>
          <span>←</span> Volver
        </button>
        <div className="discovery-loading"><span /><span /><span /></div>
      </section>
    );
  }

  if (error || !profile) {
    return (
      <section className="screen">
        <button className="button button-ghost" onClick={onBack} style={{ alignSelf: 'flex-start', marginBottom: '24px' }}>
          <span>←</span> Volver
        </button>
        <div className="surface-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
          <p>{error || 'Perfil no encontrado'}</p>
        </div>
      </section>
    );
  }

  const domina = profile.skills.filter((s: any) => s.type === 'Domina' || s.type === 0);
  const necesita = profile.skills.filter((s: any) => s.type === 'NecesitaApoyo' || s.type === 1);

  return (
    <section className="screen profile-dedicated-view">
      <button className="profile-back-button" onClick={onBack}>
        <span>←</span> Volver a resultados
      </button>

      <div className="surface-card user-profile-header">
        <p className="profile-header-kicker">PERFIL DE LA COMUNIDAD</p>
        <div className="profile-header-top">
          <ProfileAvatar userId={profile.userId} name={profile.displayName} className="avatar-large" />
          <div className="profile-titles">
            <h2>{profile.displayName}</h2>
            <p>{profile.career}</p>
            {profile.academicTerm && <span className="term-badge">{profile.academicTerm}</span>}
          </div>
        </div>

        <div className="profile-stats">
          <div className="stat-box">
            <span className="stat-value"><StarDisplay value={profile.ratingAverage} /></span>
            <span className="stat-label">Reputación ({profile.totalRatings})</span>
          </div>
          {profile.badges && profile.badges.length > 0 && (
            <div className="stat-box">
              <div className="badges-list">
                {profile.badges.map((b: string, i: number) => <span key={i} className="request-badge">{b}</span>)}
              </div>
              <span className="stat-label">Reconocimientos</span>
            </div>
          )}
        </div>
      </div>

      <div className="profile-skills-section profile-skills-offer">
        <div className="profile-section-heading">
          <span className="profile-section-marker">01</span>
          <div><p>LO QUE COMPARTE</p><h3>Temas que domina</h3></div>
        </div>
        {domina.length > 0 ? (
          <div className="skills-grid">
            {domina.map((s: any) => (
              <div key={s.id} className="skill-item offer-skill">
                <strong>{s.topic}</strong>
                <span className="confidence-pill">Confianza: {s.confidence}/5</span>
                <button className="button button-secondary small" onClick={() => onRequestSupport(s.topic)}>
                  Pedir ayuda en esto
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-text">Aún no ha agregado temas que domina.</p>
        )}
      </div>

      <div className="profile-skills-section profile-skills-need">
        <div className="profile-section-heading">
          <span className="profile-section-marker">02</span>
          <div><p>LO QUE ESTÁ EXPLORANDO</p><h3>Temas en los que busca apoyo</h3></div>
        </div>
        {necesita.length > 0 ? (
          <div className="skills-grid">
            {necesita.map((s: any) => (
              <div key={s.id} className="skill-item need-skill">
                <strong>{s.topic}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-text">Aún no ha agregado temas en los que busca apoyo.</p>
        )}
      </div>

      {profile.availability && (
        <div className="surface-card availability-section">
          <h4><Icon name="calendar" /> Disponibilidad Preferida</h4>
          <p><strong>Horarios:</strong> {profile.availability.timeSlots || 'No especificados'}</p>
          <p><strong>Modalidad:</strong> {profile.availability.preferredMode === 'Virtual' ? 'Virtual' : profile.availability.preferredMode === 'Presencial' ? 'Presencial' : 'Híbrido'}</p>
        </div>
      )}

      <div className="profile-actions-fixed">
        {alreadyConnected ? (
          <div className="status-pill big">Ya están conectados</div>
        ) : (
          <button className="button button-primary large full-width" onClick={onConnect}>
            Enviar solicitud de conexión
          </button>
        )}
      </div>
    </section>
  );
}
