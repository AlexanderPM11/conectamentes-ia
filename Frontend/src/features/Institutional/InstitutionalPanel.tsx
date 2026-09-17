import { ScreenIntro, IsoBadge } from '../../components';

export function InstitutionalPanel() {
  const topics = [{ name: 'Cálculo', value: 84 }, { name: 'Programación', value: 68 }, { name: 'Estadística', value: 52 }, { name: 'Bases de datos', value: 41 }];
  
  return (
    <section className="screen">
      <ScreenIntro kicker="VISIÓN INSTITUCIONAL" title="Tendencias sin exponer personas" description="Métricas agregadas para orientar recursos académicos con privacidad." badge="network" />
      <div className="panel-metrics">
        <article>
          <span>Demanda atendida</span>
          <strong>72%</strong>
          <small>+8% este periodo</small>
        </article>
        <article>
          <span>Solicitudes activas</span>
          <strong>148</strong>
          <small>Datos agregados</small>
        </article>
        <article>
          <span>Participación</span>
          <strong>64%</strong>
          <small>Aprenden y colaboran</small>
        </article>
      </div>
      <div className="content-grid panel-grid">
        <section className="surface-card">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">DEMANDA</p>
              <h2>Temas más solicitados</h2>
            </div>
            <select aria-label="Periodo">
              <option>Periodo actual</option>
            </select>
          </div>
          <div className="bar-chart">
            {topics.map(topic => (
              <div className="bar-row" key={topic.name}>
                <span>{topic.name}</span>
                <div>
                  <i style={{ width: topic.value + '%' }} />
                </div>
                <strong>{topic.value}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="privacy-panel">
          <IsoBadge kind="network" />
          <p className="eyebrow">PRIVACIDAD</p>
          <h2>Lo que este panel no muestra</h2>
          <ul>
            <li>Identidades de estudiantes</li>
            <li>Conversaciones privadas</li>
            <li>Valoraciones individuales</li>
          </ul>
          <p>Las categorías pequeñas se agrupan para evitar inferencias.</p>
        </section>
      </div>
    </section>
  );
}
