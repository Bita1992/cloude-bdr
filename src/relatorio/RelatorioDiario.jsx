import { useState } from 'react';
import {
  Award, Clock, Phone, Target, TrendingUp, MessageCircle,
  CheckCircle2, ChevronRight, SkipForward, RefreshCcw, Trash2,
  Calendar, Zap, Sun, X
} from 'lucide-react';

/* ── tone → classes ───────────────────────────────── */
const TONE = {
  info:   { text: 'text-blue-400',     bg: 'bg-blue-400/10',   border: 'border-blue-400/30' },
  warn:   { text: 'text-yellow-400',   bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' },
  good:   { text: 'text-success',      bg: 'bg-success/10',    border: 'border-success/30' },
  bad:    { text: 'text-hot',          bg: 'bg-hot/10',        border: 'border-hot/30' },
  mut:    { text: 'text-muted-foreground', bg: 'bg-surface',   border: 'border-border' },
  violet: { text: 'text-violet-400',   bg: 'bg-violet-400/10', border: 'border-violet-400/30' },
  solar:  { text: 'text-yellow-300',   bg: 'bg-yellow-300/10', border: 'border-yellow-300/30' },
  fit:    { text: 'text-success',      bg: 'bg-success/10',    border: 'border-success/30' },
  hot:    { text: 'text-hot',          bg: 'bg-hot/10',        border: 'border-hot/30' },
  normal: { text: 'text-foreground',   bg: 'bg-surface',       border: 'border-border' },
};
function toneClass(t) { return TONE[t] || TONE.mut; }

const REASON_ICON = { clock: Clock, award: Award, trend: TrendingUp, target: Target, chat: MessageCircle, x: X };

/* ── Tag chip ─────────────────────────────────────── */
function Tag({ label, tone = 'mut' }) {
  const t = toneClass(tone);
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${t.text} ${t.bg} ${t.border}`}>
      {label}
    </span>
  );
}

/* ── Section wrapper ──────────────────────────────── */
function Section({ title, eyebrow, count, children, empty }) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          {eyebrow && <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-0.5">{eyebrow}</div>}
          <h2 className="font-semibold">{title}</h2>
        </div>
        {count != null && (
          <span className="rounded-full bg-primary/15 text-primary text-xs font-bold px-2.5 py-1">{count}</span>
        )}
      </div>
      {empty
        ? <p className="px-5 py-8 text-center text-sm text-muted-foreground italic">{empty}</p>
        : children}
    </section>
  );
}

/* ── Funnel bar ───────────────────────────────────── */
function FunnelRow({ item, max }) {
  const pct = max > 0 ? (item.pct / 100) * 100 : 0;
  return (
    <div className={`flex items-center gap-3 py-3 px-5 ${item.isKey ? 'bg-primary/5 border-l-2 border-primary' : ''}`}>
      <div className="w-40 shrink-0">
        <div className="text-sm font-medium">{item.label}</div>
        {item.rate && (
          <div className="text-[11px] text-muted-foreground">{item.rate} {item.rateLabel}</div>
        )}
      </div>
      <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${item.isKey ? 'bg-primary' : 'bg-primary/40'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={`w-10 text-right font-mono font-bold text-sm ${item.isKey ? 'text-primary' : ''}`}>
        {item.value}
      </div>
    </div>
  );
}

/* ── Confirmation card ────────────────────────────── */
function ConfirmCard({ item, onAction }) {
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(item.message || '');

  async function confirm() {
    await onAction('confirm', item.id);
    setDone(true);
  }
  function openWa() {
    const phone = String(item.phone || '').replace(/\D/g, '');
    if (!phone) return;
    const wa = phone.startsWith('55') ? phone : `55${phone}`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 text-success text-sm">
        <CheckCircle2 size={16} /> {item.doneMsg}
      </div>
    );
  }

  return (
    <div className="px-5 py-4 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">{item.company}</span>
            {item.role && <span className="text-[11px] text-muted-foreground">{item.contact} · {item.role}</span>}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{item.dayLabel} às {item.time}</span>
            {item.tags?.map((t) => <Tag key={t.label} {...t} />)}
          </div>
          <textarea
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
            rows={3}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={openWa}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-success/15 text-success border border-success/30 text-xs font-semibold hover:bg-success/25 transition"
        >
          <MessageCircle size={13} /> Enviar WA
        </button>
        <button
          onClick={confirm}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition"
        >
          <CheckCircle2 size={13} /> Confirmar
        </button>
      </div>
    </div>
  );
}

/* ── Follow-up card ───────────────────────────────── */
function FollowCard({ item, onAction }) {
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(item.message || '');
  const wt = toneClass(item.when?.tone || 'normal');

  async function send() {
    await onAction('followup', item.id);
    setDone(true);
  }
  async function snooze() {
    await onAction('snooze', item.id);
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 text-success text-sm">
        <CheckCircle2 size={16} /> {item.doneMsg}
      </div>
    );
  }

  return (
    <div className="px-5 py-4 border-b border-border last:border-0">
      <div className="flex items-start gap-3 mb-3">
        <div className={`shrink-0 rounded-lg border ${wt.border} ${wt.bg} px-2 py-1.5 text-center min-w-[52px]`}>
          <div className={`text-[9px] font-bold uppercase ${wt.text}`}>{item.when?.label}</div>
          <div className={`text-xs font-mono font-bold ${wt.text}`}>{item.when?.sub}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{item.company}</div>
          <div className="text-[11px] text-muted-foreground mb-1.5">{item.contact} · {item.role}</div>
          <div className="flex gap-1.5 flex-wrap">{item.tags?.map((t) => <Tag key={t.label} {...t} />)}</div>
        </div>
      </div>
      <textarea
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
        rows={3}
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
      />
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={snooze}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-surface text-xs text-muted-foreground hover:bg-surface-2 transition"
        >
          <SkipForward size={13} /> {item.snoozeLabel}
        </button>
        <button
          onClick={send}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition"
        >
          <ChevronRight size={13} /> {item.primaryLabel}
        </button>
      </div>
    </div>
  );
}

/* ── Cleanup row ──────────────────────────────────── */
function CleanupRow({ item }) {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 text-success text-sm border-b border-border last:border-0">
        <CheckCircle2 size={15} /> {item.doneMsg}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{item.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{item.reason}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          className="h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-surface-2 transition"
          onClick={() => setDone(true)}
        >
          {item.snoozeLabel}
        </button>
        <button
          className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-hot/15 text-hot border border-hot/30 text-xs font-semibold hover:bg-hot/25 transition"
          onClick={() => setDone(true)}
        >
          <Trash2 size={11} /> {item.actionLabel}
        </button>
      </div>
    </div>
  );
}

/* ── NextBestAction ───────────────────────────────── */
function NextBestAction({ nba, onAction }) {
  const [done, setDone] = useState(false);
  if (!nba) return null;
  if (done) return null;

  return (
    <section className="rounded-2xl border-2 border-primary/40 bg-primary/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-primary/20">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-primary mb-1">Próxima melhor ação</div>
        <h2 className="font-semibold text-base">{nba.headline}</h2>
        <p className="text-xs text-muted-foreground mt-1">{nba.why}</p>
      </div>
      <div className="px-5 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {nba.reasons?.map((r) => {
            const Icon = REASON_ICON[r.icon] || Zap;
            return (
              <div key={r.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon size={12} className="text-primary" /> {r.label}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setDone(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-surface text-xs text-muted-foreground hover:bg-surface-2 transition"
          >
            <SkipForward size={13} /> {nba.skipLabel}
          </button>
          <button
            onClick={async () => { await onAction('call', nba.leadId); setDone(true); }}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold glow-primary hover:brightness-110 transition"
          >
            <Phone size={14} /> {nba.callLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── Main export ──────────────────────────────────── */
export function RelatorioDiario({ data, onAction }) {
  if (!data) return (
    <div className="flex items-center justify-center py-24 text-muted-foreground text-sm animate-pulse">
      Carregando relatório…
    </div>
  );

  const { summary, funnel, quality, confirmations, followups, cleanup, nextBestAction, insights, tomorrow, weekdayLabel, now, user, campaign } = data;
  const metBeat = summary.meetingsBooked >= summary.meetingsGoal;

  return (
    <div className="grid gap-5">

      {/* ── Header ── */}
      <div className="rounded-2xl border border-border bg-card p-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-12 h-48 w-48 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{weekdayLabel} · {now}</div>
          <h1 className="text-3xl font-semibold">
            Relatório do dia,{' '}
            <span className="italic text-primary">{user?.firstName}</span>.
          </h1>
          <div className="text-sm text-muted-foreground mt-1">{campaign} · {user?.role}</div>
        </div>
      </div>

      {/* ── Summary hero ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`col-span-2 rounded-2xl border ${metBeat ? 'border-success/40 bg-success/5' : 'border-primary/40 bg-primary/5'} p-5`}>
          <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">Reuniões agendadas</div>
          <div className="flex items-end gap-2">
            <span className={`font-mono text-5xl font-bold ${metBeat ? 'text-success' : 'text-primary'}`}>
              {summary.meetingsBooked}
            </span>
            <span className="text-muted-foreground text-lg mb-1 font-mono">/{summary.meetingsGoal}</span>
            {metBeat && <span className="text-success text-sm mb-1 font-semibold">✓ meta batida</span>}
          </div>
          {summary.meetingsYesterday != null && (
            <div className="text-xs text-muted-foreground mt-1">
              {summary.meetingsBooked > summary.meetingsYesterday
                ? `+${summary.meetingsBooked - summary.meetingsYesterday} vs ontem`
                : summary.meetingsBooked === summary.meetingsYesterday
                  ? 'igual a ontem'
                  : `${summary.meetingsBooked - summary.meetingsYesterday} vs ontem`}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">Ligações</div>
          <div className="font-mono text-4xl font-bold">{summary.callsMade}</div>
          <div className="text-xs text-muted-foreground mt-1">hoje</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">Qualidade</div>
          <div className="font-mono text-4xl font-bold text-success">{funnel.find(f => f.key === 'qualified')?.value ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">conversas com fit</div>
        </div>
      </div>

      {/* ── Funnel ── */}
      <Section title="Funil do dia" eyebrow="Conversão">
        <div className="divide-y divide-border">
          {funnel.map((item) => <FunnelRow key={item.key} item={item} max={100} />)}
        </div>
      </Section>

      {/* ── Quality chips ── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-4">Distribuição de resultados</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {quality.map((q) => {
            const t = toneClass(q.tone);
            return (
              <div key={q.key} className={`rounded-xl border ${t.border} ${t.bg} p-3`}>
                <div className={`font-mono text-2xl font-bold ${t.text}`}>{q.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{q.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Next best action ── */}
      <NextBestAction nba={nextBestAction} onAction={onAction} />

      {/* ── Confirmations ── */}
      <Section
        title="Confirmar reuniões"
        eyebrow="Para hoje"
        count={confirmations?.length}
        empty={!confirmations?.length ? 'Nenhuma reunião para confirmar.' : null}
      >
        {confirmations?.map((item) => (
          <ConfirmCard key={item.id} item={item} onAction={onAction} />
        ))}
      </Section>

      {/* ── Follow-ups ── */}
      <Section
        title="Retomadas quentes"
        eyebrow="Follow-ups"
        count={followups?.length}
        empty={!followups?.length ? 'Nenhum follow-up pendente.' : null}
      >
        {followups?.map((item) => (
          <FollowCard key={item.id} item={item} onAction={onAction} />
        ))}
      </Section>

      {/* ── Cleanup ── */}
      {cleanup?.length > 0 && (
        <Section title="Limpar discadora" eyebrow="Higienização" count={cleanup.length}>
          {cleanup.map((item) => <CleanupRow key={item.id} item={item} />)}
        </Section>
      )}

      {/* ── Insights ── */}
      <Section title="Insights do dia" eyebrow="Análise">
        <div className="divide-y divide-border">
          {insights?.map((insight) => {
            const Icon = REASON_ICON[insight.icon] || Zap;
            return (
              <div key={insight.key} className={`flex items-start gap-4 px-5 py-4 ${insight.highlight ? 'bg-primary/5' : ''}`}>
                <div className={`shrink-0 h-8 w-8 rounded-lg grid place-items-center ${insight.highlight ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-muted-foreground'}`}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{insight.key}</div>
                  <div className={`font-semibold text-sm mt-0.5 ${insight.highlight ? 'text-primary' : ''}`}>{insight.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{insight.note}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Tomorrow ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sun size={15} className="text-warning" />
          <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Amanhã começa assim</div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {tomorrow?.map((item, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${item.highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface'}`}>
              <span className={`font-mono text-2xl font-bold ${item.highlight ? 'text-primary' : 'text-foreground'}`}>{item.n}</span>
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
