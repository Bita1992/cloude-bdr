/* MetricGridNew — painel de métricas secundárias com novo design Tailwind */

export function MetricGridNew({ dashboard }) {
  const openTasks   = dashboard?.openTasks             ?? '-';
  const overdue     = dashboard?.overdue               ?? '-';
  const significant = dashboard?.significantCallsToday ?? '-';
  const avgDuration = dashboard?.avgCallDurationMin    ?? null;

  const overdueNum = typeof overdue === 'number' ? overdue : parseInt(overdue, 10);
  const hasOverdue = !isNaN(overdueNum) && overdueNum > 0;

  const items = [
    { label: 'Abertas',      value: openTasks,   accent: 'border-border' },
    { label: 'Atrasadas',    value: overdue,     accent: hasOverdue ? 'border-hot/40 bg-hot/5' : 'border-border' },
    { label: 'Significativas', value: significant, accent: 'border-success/40 bg-success/5' },
    ...(avgDuration !== null ? [{ label: 'TMO (min)', value: avgDuration, accent: 'border-border' }] : []),
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-xl border ${item.accent} bg-card p-4`}
        >
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="font-mono text-2xl font-semibold mt-1">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
