import { useEffect } from 'react';

const PIECES = Array.from({ length: 28 }, (_, i) => i);

export function CelebrationOverlay({ meetingsTotal, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="celebration-overlay" onClick={onDone} role="dialog" aria-live="assertive" aria-label="Reunião agendada!">
      <div className="celebration-content">
        <div className="celebration-icon">🎯</div>
        <h2 className="celebration-title">REUNIÃO AGENDADA!</h2>
        {meetingsTotal > 0 && (
          <p className="celebration-sub">
            {meetingsTotal} {meetingsTotal === 1 ? 'reunião esta semana' : 'reuniões esta semana'}
          </p>
        )}
        <p className="celebration-hint">clique para continuar</p>
      </div>
      <div className="confetti-container" aria-hidden="true">
        {PIECES.map((i) => (
          <span key={i} className="confetti-piece" style={{ '--i': i }} />
        ))}
      </div>
    </div>
  );
}
