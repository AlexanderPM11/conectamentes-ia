import { useState } from 'react';
import { api } from '../../shared/api/client';
import { ConfirmDialog, ProfileAvatar } from '../../components';

export function connectionStatus(status: any) {
  if (status === 0 || status === 'PendienteColaborador') return 'pendiente';
  if (status === 1 || status === 'Activa') return 'activa';
  if (status === 2 || status === 'Rechazada') return 'rechazada';
  return 'cancelada';
}

export function ConnectionStatusPanel({ connections = [], notify, onOpenChat, onRefresh, onlyResolved = false }: any) {
  const [pendingAction, setPendingAction] = useState<any | null>(null);
  const resolved = connections.filter((item: any) => ['activa', 'rechazada', 'cancelada'].includes(connectionStatus(item.status)));
  const visible = onlyResolved ? resolved : connections;
  const active = visible.filter((item: any) => connectionStatus(item.status) === 'activa');
  const history = visible.filter((item: any) => ['rechazada', 'cancelada'].includes(connectionStatus(item.status)));

  async function cancel(item: any) {
    try {
      await api(`/api/conexiones/${item.id}/cancelar`, { method: 'POST' });
      await onRefresh();
      notify('Conexión cerrada.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No pudimos cerrar la conexión.');
    } finally {
      setPendingAction(null);
    }
  }

  if (!visible.length || (onlyResolved && !resolved.length)) return null;

  return <>
    <section className="connection-requests-panel profile-connections-panel surface-card">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">HISTORIAL DE CONEXIONES</p>
          <h2>Mis conexiones y estados</h2>
        </div>
        <span className="count-badge">{active.length + history.length}</span>
      </div>
      <p className="connection-requests-intro">Aquí aparecen las conexiones aprobadas y las solicitudes que ya terminaron.</p>

      {active.length > 0 && <div className="connection-active-list">
        <div className="connection-subheading"><strong>Conexiones aprobadas</strong><span>Ambos aceptaron</span></div>
        {active.map((item: any) => <div className="connection-active-row" key={item.id}>
          <ProfileAvatar userId={item.counterpartId} name={item.counterpart} version={item.counterpartAvatarUpdatedAt} className="connection-request-avatar" />
          <div><strong>{item.counterpart}</strong><small>{item.topic || 'Conexión directa'} · Chat disponible</small></div>
          <div className="connection-request-actions"><button className="button button-primary small" onClick={() => onOpenChat(item.id)}>Conversar</button><button className="button button-ghost small" onClick={() => setPendingAction({ item })}>Cerrar conexión</button></div>
        </div>)}
      </div>}

      {history.length > 0 && <details className="connection-history" open>
        <summary>Solicitudes cerradas ({history.length})</summary>
        <div>{history.map((item: any) => <p key={item.id}><strong>{item.counterpart}</strong><span>{connectionStatus(item.status) === 'rechazada' ? 'Rechazada' : 'Cancelada'}</span></p>)}</div>
      </details>}
    </section>
    {pendingAction && <ConfirmDialog title="¿Cerrar esta conexión?" message={`Se cerrará la conexión con ${pendingAction.item.counterpart}. Dejarán de tener disponible el chat.`} confirmLabel="Cerrar conexión" onConfirm={() => cancel(pendingAction.item)} onCancel={() => setPendingAction(null)} />}
  </>;
}
