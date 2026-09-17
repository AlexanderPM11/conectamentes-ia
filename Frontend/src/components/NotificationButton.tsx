import { Icon } from './Icon';

export function NotificationButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button className="notification-button" onClick={onClick} aria-label={`Notificaciones, ${count} sin leer`}>
      <Icon name="bell" />
      {count > 0 && <span>{count > 9 ? '9+' : count}</span>}
    </button>
  );
}
