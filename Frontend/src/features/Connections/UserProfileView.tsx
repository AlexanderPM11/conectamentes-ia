import { useState, useEffect } from 'react';
import { api } from '../../shared/api/client';
import { initials } from '../../utils/string';
import { Icon, StarDisplay, StarRating, ProfileAvatar } from '../../components';

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
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingNotice, setRatingNotice] = useState('');
  const [ratingForm, setRatingForm] = useState({ usefulness: 5, clarity: 5, fulfillment: 5, respect: 5, comment: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api(`/api/usuarios/${userId}/perfil`)
      .then(data => {
        if (!cancelled) {
          setProfile(data);
          setRatingForm({
            usefulness: data.myRating?.usefulness ?? 5,
            clarity: data.myRating?.clarity ?? 5,
            fulfillment: data.myRating?.fulfillment ?? 5,
            respect: data.myRating?.respect ?? 5,
            comment: data.myRating?.comment ?? ''
          });
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No pudimos cargar el perfil');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  async function saveRating() {
    setRatingSaving(true);
    setRatingNotice('');
    try {
      const saved = await api(`/api/usuarios/${userId}/valoracion`, { method: 'PUT', body: JSON.stringify(ratingForm) });
      setProfile((current: any) => ({
        ...current,
        myRating: saved,
        totalRatings: current.totalRatings + (current.myRating ? 0 : 1),
        ratingAverage: current.myRating
          ? (current.ratingAverage * current.totalRatings - ((current.myRating.usefulness + current.myRating.clarity + current.myRating.fulfillment + current.myRating.respect) / 4) + ((saved.usefulness + saved.clarity + saved.fulfillment + saved.respect) / 4)) / current.totalRatings
          : ((current.ratingAverage * current.totalRatings) + ((saved.usefulness + saved.clarity + saved.fulfillment + saved.respect) / 4)) / (current.totalRatings + 1)
      }));
      setRatingOpen(false);
      setRatingNotice('Tu valoración quedó guardada. Puedes editarla cuando quieras.');
    } catch (caught) {
      setRatingNotice(caught instanceof Error ? caught.message : 'No pudimos guardar tu valoración.');
    } finally {
      setRatingSaving(false);
    }
  }

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

      {profile.canRate && (
        <section className="profile-rating-card surface-card">
          <div className="profile-rating-heading">
            <div>
              <p className="eyebrow">EXPERIENCIA COMPARTIDA</p>
              <h3>{profile.myRating ? 'Tu valoración' : 'Valora esta colaboración'}</h3>
            </div>
            <span className="profile-rating-icon">★</span>
          </div>
          {ratingNotice && <p className="inline-message" role="status">{ratingNotice}</p>}
          {!ratingOpen ? (
            <div className="profile-rating-summary">
              {profile.myRating ? (
                <>
                  <StarDisplay value={(profile.myRating.usefulness + profile.myRating.clarity + profile.myRating.fulfillment + profile.myRating.respect) / 4} />
                  <p>Ya compartiste tu experiencia{profile.myRating.comment ? `: “${profile.myRating.comment}”` : '.'}</p>
                  <button className="button button-secondary small" onClick={() => setRatingOpen(true)}>Editar valoración</button>
                </>
              ) : (
                <>
                  <p>Tu opinión ayuda a que otras personas encuentren colaboraciones confiables.</p>
                  <button className="button button-primary small" onClick={() => setRatingOpen(true)}>Calificar persona</button>
                </>
              )}
            </div>
          ) : (
            <div className="profile-rating-form">
              <StarRating label="Utilidad" help="¿Te ayudó a avanzar?" value={ratingForm.usefulness} onChange={value => setRatingForm({ ...ratingForm, usefulness: value })} />
              <StarRating label="Claridad" help="¿Explicó de forma comprensible?" value={ratingForm.clarity} onChange={value => setRatingForm({ ...ratingForm, clarity: value })} />
              <StarRating label="Cumplimiento" help="¿Respetó lo acordado?" value={ratingForm.fulfillment} onChange={value => setRatingForm({ ...ratingForm, fulfillment: value })} />
              <StarRating label="Respeto" help="¿Fue una experiencia cuidadosa?" value={ratingForm.respect} onChange={value => setRatingForm({ ...ratingForm, respect: value })} />
              <label>Comentario académico <span className="optional-label">opcional</span>
                <textarea value={ratingForm.comment} maxLength={500} onChange={event => setRatingForm({ ...ratingForm, comment: event.target.value })} placeholder="Ej. Explicó los ejercicios paso a paso." />
              </label>
              <div className="profile-rating-actions">
                <button className="button button-ghost small" type="button" onClick={() => setRatingOpen(false)} disabled={ratingSaving}>Cancelar</button>
                <button className="button button-primary small" type="button" onClick={saveRating} disabled={ratingSaving}>{ratingSaving ? 'Guardando…' : 'Guardar valoración'}</button>
              </div>
            </div>
          )}
        </section>
      )}

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
