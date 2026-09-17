import { IsoBadge } from './IsoBadge';

export function ActionCard({ badge, title, text, onClick }: { badge: 'book' | 'chat' | 'network'; title: string; text: string; onClick: () => void }) {
  return (
    <button className="action-card" onClick={onClick}>
      <IsoBadge kind={badge} />
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <b>→</b>
    </button>
  );
}
