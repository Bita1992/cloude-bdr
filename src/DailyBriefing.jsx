import { useMemo } from 'react';
import { PlayCircle, Target, Phone, Calendar, TrendingUp, Zap } from 'lucide-react';

const PHRASES = {
  dawn:      ['Você chegou antes da maioria. Isso já é uma vantagem.', 'Cedo é quando os pipelines se constroem. Bora.'],
  morning:   ['Cada ligação que você faz agora é dinheiro no futuro.', 'Uma conversa pode mudar o quarter. Essa pode ser ela.'],
  afternoon: ['Tarde é hora de colher o que a manhã plantou.', 'Follow-up bem feito é reunião marcada. Vai lá.'],
  evening:   ['Encerre bem o dia — o pipeline de amanhã agradece.', 'Último sprint do dia. O que você fizer agora conta.'],
};

function getSlot(h) {
  if (h < 7)  return 'dawn';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function getGreeting(h) {
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function DailyBriefing({ dashboard, userName, onStartFocus }) {
  const now  = new Date();
  const hour = now.getHours();
  const min  = now.getMinutes();

  const slot    = getSlot(hour);
  const phrases = PHRASES[slot];
  const phrase  = phrases[Math.floor(min / 30) % phrases.length];

  const meetings  = dashboard?.meetings        ?? 0;
  const callsDone = dashboard?.callsDoneToday  ?? 0;
  const callGoal  = 50;
  const callPct   = Math.min(100, Math.round((callsDone / callGoal) * 100));

  const meetingDelta = useMemo(() => {
    const y = dashboard?.meetingsYesterday;
    if (y == null) return null;
    const d = meetings - y;
    return d === 0 ? null : d > 0 ? `+${d} vs ontem` : `${d} vs ontem`;
  }, [meetings, dashboard?.meetingsYesterday]);

  const openTasks = dashboard?.openTasks   ?? 0;
  const overdue   = dashboard?.overdue     ?? 0;
  const dueToday  = dashboard?.dueToday    ?? 0;
  const sigCalls  = dashboard?.significantCallsToday ?? 0;

  const stats = [
    { label: 'Ligações hoje',      value: callsDone, hint: `meta ${callGoal}`, pct: callPct,  accent: 'primary', icon: Phone },
    { label: 'Reuniões',           value: meetings,  hint: 'esta semana',      pct: Math.min(100, meetings * 20), accent: 'success', icon: Calendar },
    { label: 'Tarefas abertas',    value: openTasks, hint: `${dueToday} hoje`, pct: dueToday && openTasks ? Math.round((dueToday / openTasks) * 100) : 0, accent: 'info', icon: Target },
    { label: 'Sig. hoje',          value: sigCalls,  hint: overdue > 0 ? `${overdue} atrasadas` : 'ok', pct: Math.min(100, sigCalls * 10), accent: overdue > 0 ? 'hot' : 'warning', icon: TrendingUp },
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <div className="absolute inset-0 grid-bg opacity-25 pointer-events-none" />
      <div className="absolute -top-28 -right-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />

      <div className="relative p-6 md:p-8 grid grid-cols-12 gap-6">
        {/* ── Greeting ── */}
        <div className="col-span-12 lg:col-span-5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="relative inline-flex text-primary">
              <span className="pulse-dot">●</span>
            </span>
            <span>
              {hour < 12 ? 'Manhã' : hour < 18 ? 'Tarde' : 'Fechamento'} · {String(hour).padStart(2,'0')}:{String(min).padStart(2,'0')}
            </span>
          </div>

          <h1 className="mt-3 text-4xl md:text-5xl leading-[1.1] font-semibold">
            {getGreeting(hour)}, <span className="italic text-primary">{userName || 'Luciano'}</span>.
          </h1>
          <p className="mt-3 text-muted-foreground text-sm max-w-sm">{phrase}</p>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm glow-primary hover:brightness-110 transition"
              onClick={onStartFocus}
            >
              <PlayCircle size={16} /> Iniciar execução
            </button>
            <button
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-surface text-sm hover:bg-surface-2 transition"
              onClick={onStartFocus}
            >
              <Zap size={14} /> Power hour
            </button>
            {meetingDelta && (
              <span className={`text-xs font-mono font-semibold ${meetingDelta.startsWith('+') ? 'text-success' : 'text-destructive'}`}>
                {meetingDelta}
              </span>
            )}
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="col-span-12 lg:col-span-7 grid grid-cols-2 gap-3">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-xl border border-border bg-surface/80 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <Icon size={13} className="text-muted-foreground" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-3xl font-semibold tracking-tight">{s.value}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{s.hint}</span>
                </div>
                <div className="mt-2.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${s.pct}%`,
                      background: s.accent === 'primary' ? 'var(--primary)'
                        : s.accent === 'success' ? 'var(--success)'
                        : s.accent === 'info'    ? 'var(--info)'
                        : s.accent === 'hot'     ? 'var(--hot)'
                        : 'var(--warning)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
