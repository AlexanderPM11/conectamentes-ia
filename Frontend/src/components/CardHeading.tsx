export function CardHeading({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="card-heading">
      <div>
        <span className="step-number">{number}</span>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </div>
    </div>
  );
}
