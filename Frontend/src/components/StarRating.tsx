export function StarRating({ label, help, value, onChange }: { label: string; help: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="star-rating">
      <legend>
        <strong>{label}</strong>
        <small>{help}</small>
      </legend>
      <div role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map(star => (
          <button 
            type="button" 
            role="radio" 
            aria-checked={value === star} 
            aria-label={`${star} ${star === 1 ? 'estrella' : 'estrellas'}`} 
            className={star <= value ? 'selected' : ''} 
            key={star} 
            onClick={() => onChange(star)}
          >
            ★
          </button>
        ))}
      </div>
      <b>{value}/5</b>
    </fieldset>
  );
}
