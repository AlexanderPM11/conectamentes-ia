export function StarDisplay({ value }: { value: number }) { 
  const rounded = Math.round(Number(value)); 
  return (
    <span className="star-display" aria-label={`${Number(value).toFixed(1)} de 5 estrellas`}>
      {Array.from({ length: 5 }, (_, index) => <i className={index < rounded ? 'filled' : ''} key={index}>★</i>)}
    </span>
  );
}
