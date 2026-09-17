export function IsoBadge({ kind, large = false }: { kind: 'book' | 'chat' | 'network'; large?: boolean }) {
  return <span className={`iso-badge iso-${kind}${large ? ' iso-large' : ''}`} aria-hidden="true" />;
}
