export function Brand({ large = false, light = false }: { large?: boolean; light?: boolean }) {
  return (
    <div className={`${large ? 'brand brand-large' : 'brand'}${light ? ' brand-light' : ''}`} aria-label="ConectaMentes IA">
      <span>Conecta</span>Mentes <em>IA</em>
    </div>
  );
}
