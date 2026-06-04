/* MetricGridNew — painel de métricas secundárias.
   NÃO duplica reuniões nem ligações — esses ficam no DailyBriefing.
   Foco: abertas, atrasadas, significativas, tmo (tempo médio). */

export function MetricGridNew({ dashboard }) {
  const openTasks   = dashboard?.openTasks               ?? '-';
  const overdue     = dashboard?.overdue                 ?? '-';
  const significant = dashboard?.significantCallsToday   ?? '-';
  const avgDuration = dashboard?.avgCallDurationMin       ?? null;

  const overdueNum  = typeof overdue === 'number' ? overdue : parseInt(overdue, 10);
  const hasOverdue  = !isNaN(overdueNum) && overdueNum > 0;

  return (
    <div className="metric-grid-new" aria-label="Métricas secundárias">

      <div className="mgn-item" aria-label={`Tarefas abertas: ${openTasks}`}>
        <span className="mgn-label">Abertas</span>
        <strong className="mgn-value">{openTasks}</strong>
      </div>

      <div
        className={`mgn-item${hasOverdue ? ' mgn-item--overdue' : ''}`}
        aria-label={`Atrasadas: ${overdue}`}
      >
        <span className="mgn-label">Atrasadas</span>
        <strong className="mgn-value">{overdue}</strong>
      </div>

      <div className="mgn-item mgn-item--significant" aria-label={`Ligações significativas: ${significant}`}>
        <span className="mgn-label">Significativas</span>
        <strong className="mgn-value">{significant}</strong>
      </div>

      {avgDuration !== null && (
        <div className="mgn-item" aria-label={`TMO: ${avgDuration} min`}>
          <span className="mgn-label">TMO</span>
          <strong className="mgn-value">{avgDuration}<small>min</small></strong>
        </div>
      )}

    </div>
  );
}
