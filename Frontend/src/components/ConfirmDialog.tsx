import { useEffect } from 'react';
import { Icon } from './Icon';

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="custom-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel(); }}>
      <section className="custom-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
        <div className="custom-dialog-head">
          <span className="dialog-icon"><Icon name="calendar" /></span>
          <button type="button" className="dialog-close" onClick={onCancel} aria-label="Cerrar confirmación">×</button>
        </div>
        <p className="eyebrow">CONFIRMACIÓN</p>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="custom-dialog-actions">
          <button type="button" className="button button-ghost" autoFocus onClick={onCancel}>Cancelar</button>
          <button type="button" className="button button-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
