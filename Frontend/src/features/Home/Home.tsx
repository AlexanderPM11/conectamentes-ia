import { ScreenIntro } from '../../components/ScreenIntro';
import { ActionCard } from '../../components/ActionCard';

export function Home({ me, profile, requests, connections, navigate }: any) {
  const skills = profile.habilidades?.length ?? 0;
  const activeConnections = connections.filter((item: any) => item.status === 'Activa' || item.status === 1).length;
  
  const next = skills === 0 
    ? { title: 'Completa tu mapa de aprendizaje', text: 'Agrega los temas que dominas y aquellos en los que buscas apoyo para mejorar tus conexiones.', action: 'Ir a mi perfil', tab: 'perfil' } 
    : requests.length === 0 
      ? { title: 'Convierte una duda en un encuentro', text: 'Publica aquello que quieres comprender y te mostraremos compañeros compatibles.', action: 'Pedir apoyo', tab: 'solicitudes' } 
      : { title: 'Tu red de aprendizaje ya está en marcha', text: 'Revisa tus coincidencias y organiza el siguiente encuentro con un objetivo claro.', action: 'Ver conexiones', tab: 'coincidencias' };
      
  return (
    <section className="screen home-screen">
      <ScreenIntro kicker="TU COMUNIDAD" title={`Hola, ${me?.displayName ?? 'estudiante'}`} description="Hoy puede ser un buen día para resolver una duda o compartir algo que ya dominas." badge="book" />
      <div className="home-hero">
        <div>
          <span className="soft-label">SIGUIENTE PASO</span>
          <h2>{next.title}</h2>
          <p>{next.text}</p>
          <button className="button button-light" onClick={() => navigate(next.tab)}>{next.action} <span>→</span></button>
        </div>
        <img src="/illustrations/learning-icons.png" alt="Libro, conversación y conexiones" />
      </div>
      <div className="metric-row">
        <article><strong>{skills}</strong><span>temas en tu mapa</span></article>
        <article><strong>{requests.length}</strong><span>solicitudes creadas</span></article>
        <article><strong>{activeConnections}</strong><span>conexiones activas</span></article>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">ACCESOS RÁPIDOS</p>
          <h2>¿Qué quieres hacer?</h2>
        </div>
      </div>
      <div className="action-grid">
        <ActionCard badge="chat" title="Pedir apoyo" text="Publica una duda con tus propias palabras." onClick={() => navigate('solicitudes')} />
        <ActionCard badge="network" title="Ver conexiones" text="Conoce por qué cada compañero es compatible." onClick={() => navigate('coincidencias')} />
        <ActionCard badge="chat" title="Abrir mensajes" text="Continúa aprendiendo en tiempo real." onClick={() => navigate('mensajes')} />
        <ActionCard badge="book" title="Organizar sesión" text="Propón fecha, duración y objetivo." onClick={() => navigate('agenda')} />
      </div>
    </section>
  );
}
