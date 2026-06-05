import { useMemo } from 'react';
import { PlayCircle, Target, Phone, Calendar, TrendingUp, Zap, Users } from 'lucide-react';

const PHRASES = {
  dawn:      ['Você chegou antes da maioria. Isso já é uma vantagem.', 'Cedo é quando os pipelines se constroem. Bora.'],
  morning:   ['Cada ligação que você faz agora é dinheiro no futuro.', 'Uma conversa pode mudar o quarter. Essa pode ser ela.'],
  afternoon: ['Tarde é hora de colher o que a manhã plantou.', 'Follow-up bem feito é reunião marcada. Vai lá.'],
  evening:   ['Encerre bem o dia — o pipeline de amanhã agradece.', 'Último sprint do dia. O que você fizer agora conta.'],
};

/* Metas diárias — ajuste conforme o seu target */
const GOALS = {
  calls:       80,
  connections: 8,
  meetings:    2,
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

function GoalBar({ label, value, goal, accentOk, accentWarn, accentBad, icon: Icon }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const ratio = goal > 0 ? value / goal : 0;
  const accent = ratio >= 1 ? accentOk : ratio >= 0.6 ? accentWarn : accentBad;
  const done = value >= goal;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-36 shrink-0">
        <Icon size={13} className="text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
      <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: `var(--${accent})` }}
        />
      </div>
      <div className="flex items-center gap-1 w-20 justify-end shrink-0">
        <span className={`font-mono text-sm font-bold`} style={{ color: `var(--${accent})` }}>
          {value}
        </span>
        <span className="text-muted-foreground text-xs font-mono">/{goal}</span>
        {done && <span className="text-success text-[10px] ml-0.5">✓</span>}
      </div>
    </div>
  );
}

export function DailyBriefing({ dashboard, userName, onStartFocus }) {
  const now  = new Date();
  const hour = now.getHours();
  const min  = now.getMinutes();

  const slot    = getSlot(hour);
  const phrases = PHRASES[slot];
  const phrase  = phrases[Math.floor(min / 30) % phrases.length];

  const callsDone    = dashboard?.callsDoneToday      ?? 0;
  const connections  = dashboard?.connectionsToday    ?? 0;
  const meetingsWeek = dashboard?.meetingsThisWeek    ?? dashboard?.meetings ?? 0;
  const openTasks    = dashboard?.openTasks           ?? 0;
  const overdue      = dashboard?.overdue             ?? 0;
  const dueToday     = dashboard?.dueToday            ?? 0;
  const sigCalls     = dashboard?.significantCallsToday ?? 0;

  const meetingDelta = useMemo(() => {
    const y = dashboard?.meetingsYesterday;
    if (y == null) return null;
    const d = meetingsWeek - y;
    return d === 0 ? null : d > 0 ? `+${d} vs ontem` : `${d} vs ontem`;
  }, [meetingsWeek, dashboard?.meetingsYesterday]);

  const stats = [
    { label: 'Ligações hoje',   value: callsDone,   hint: `meta ${GOALS.calls}`,   pct: Math.min(100, Math.round((callsDone / GOALS.calls) * 100)),     accent: 'primary',  icon: Phone },
    { label: 'Reuniões semana', value: meetingsWeek, hint: `meta ${GOALS.meetings}`, pct: Math.min(100, meetingsWeek * (100 / GOALS.meetings)),           accent: 'success',  icon: Calendar },
    { label: 'Tarefas abertas', value: openTasks,   hint: `${dueToday} hoje`,        pct: dueToday && openTasks ? Math.round((dueToday / openTasks) * 100) : 0, accent: 'info', icon: Target },
    { label: 'Sig. hoje',       value: sigCalls,    hint: overdue > 0 ? `${overdue} atrasadas` : 'ok', pct: Math.min(100, sigCalls * 10), accent: overdue > 0 ? 'hot' : 'warning', icon: TrendingUp },
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

      {/* ── Meta do dia — barra de progresso ── */}
      <div className="relative border-t border-border bg-card/60 px-6 md:px-8 py-4 flex flex-col gap-2.5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1 flex items-center gap-1.5">
          <Target size={11} /> Meta do dia
        </div>
        <GoalBar label="Ligações"   value={callsDone}   goal={GOALS.calls}       icon={Phone}    accentOk="success" accentWarn="primary" accentBad="warning" />
        <GoalBar label="Conexões"   value={connections} goal={GOALS.connections} icon={Users}    accentOk="success" accentWarn="info"    accentBad="warning" />
        <GoalBar label="Reuniões"   value={meetingsWeek}goal={GOALS.meetings}    icon={Calendar} accentOk="success" accentWarn="warning" accentBad="hot" />
      </div>
    </section>
  );
}
