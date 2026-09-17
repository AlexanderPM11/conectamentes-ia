import { useState, FormEvent } from 'react';
import { api } from '../../shared/api/client';
import { ScreenIntro, IsoBadge, EmptyState } from '../../components';

export function Security({ connections, notify }: any) {
  const [form, setForm] = useState({ reportedUserId: '', referenceId: '', reason: '', description: '' });
  
  async function submit(event: FormEvent) { 
    event.preventDefault(); 
    try { 
      await api('/api/reportes', { method: 'POST', body: JSON.stringify(form) }); 
      setForm({ reportedUserId: '', referenceId: '', reason: '', description: '' }); 
      notify('Reporte recibido. Un moderador humano lo revisará.'); 
    } catch (error) { 
      notify(error instanceof Error ? error.message : 'No pudimos enviar el reporte.'); 
    } 
  }
  
  function chooseConnection(id: string) { 
    const item = connections.find((connection: any) => connection.id === id); 
    setForm({ ...form, referenceId: id, reportedUserId: item?.counterpartId ?? '' }); 
  }
  
  return (
    <section className="screen">
      <ScreenIntro kicker="CONFIANZA Y CUIDADO" title="Siempre hay una persona detrás" description="Los reportes los revisa un moderador humano. La IA nunca decide sanciones." badge="chat" />
      <div className="safety-banner">
        <IsoBadge kind="network" />
        <div>
          <strong>Tu seguridad va primero</strong>
          <p>Bloquear tiene efecto inmediato. Reportar inicia una revisión privada y humana.</p>
        </div>
      </div>
      <form className="surface-card form-surface report-form" onSubmit={submit}>
        {connections.length ? (
          <>
            <label>¿Sobre qué conexión quieres informar?
              <select value={form.referenceId} onChange={event => chooseConnection(event.target.value)} required>
                <option value="">Selecciona una conexión</option>
                {connections.map((item: any) => <option key={item.id} value={item.id}>{item.counterpart} · {item.topic}</option>)}
              </select>
            </label>
            <label>Motivo
              <select value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} required>
                <option value="">Selecciona una opción</option>
                <option value="conducta">Conducta inapropiada</option>
                <option value="integridad">Integridad académica</option>
                <option value="privacidad">Privacidad</option>
                <option value="otro">Otro motivo</option>
              </select>
            </label>
            <label>Cuéntanos qué ocurrió
              <textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Describe los hechos con el detalle que consideres necesario." required />
            </label>
            <div className="form-footer">
              <p>Solo el equipo de moderación podrá consultar este reporte.</p>
              <button className="button button-danger">Enviar a revisión humana</button>
            </div>
          </>
        ) : <EmptyState title="No tienes conexiones que reportar" text="Este espacio se activará cuando hayas conectado con otro estudiante." badge="network" />}
      </form>
    </section>
  );
}
