import { IsoBadge } from './IsoBadge';

export function EmptyState({ title, text, badge }: { title: string; text: string; badge: 'book' | 'chat' | 'network' }) {
  return (
    <section className="empty-state">
      <IsoBadge kind={badge} large />
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}
