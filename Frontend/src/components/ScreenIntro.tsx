import { IsoBadge } from './IsoBadge';

export function ScreenIntro({ kicker, title, description, badge }: { kicker: string; title: string; description: string; badge: 'book' | 'chat' | 'network' }) {
  return (
    <header className="screen-intro">
      <div>
        <p className="eyebrow">{kicker}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <IsoBadge kind={badge} large />
    </header>
  );
}
