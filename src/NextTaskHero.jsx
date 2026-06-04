import { Phone, Mail, MessageSquare, Linkedin, RefreshCcw, Calendar, ChevronRight, Flame } from 'lucide-react';

const TYPE_META = {
  CALL:                { label: 'Ligação',       icon: Phone,         accent: 'text-info' },
  WHATSAPP:            { label: 'WhatsApp',      icon: MessageSquare, accent: 'text-success' },
  EMAIL:               { label: 'E-mail',        icon: Mail,          accent: 'text-primary' },
  LINKEDIN:            { label: 'LinkedIn',      icon: Linkedin,      accent: 'text-info' },
  FOLLOW_UP:           { label: 'Follow-up',     icon: RefreshCcw,    accent: 'text-warning' },
  MEETING_CONFIRMATION:{ label: 'Confirmação',   icon: Calendar,      accent: 'text-success' },
  CLOSER_FOLLOW_UP:    { label: 'Closer',        icon: ChevronRight,  accent: 'text-success' },
  ENRICHMENT:          { label: 'Enriquecimento', icon: null,          accent: 'text-muted-foreground' },
};

function fmt(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return null; }
}

export function NextTaskHero({ task, onExecute }) {
  if (!task) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-center gap-3 text-muted-foreground">
        <span className="text-2xl">✓</span>
        <div>
          <div className="font-semibold">Tudo limpo por agora</div>
          <div className="text-sm">Sem tarefas pendentes na fila.</div>
        </div>
      </div>
    );
  }

  const meta    = TYPE_META[task.type] ?? TYPE_META.CALL;
  const Icon    = meta.icon ?? Phone;
  const company = task.trade_name ?? task.legal_name ?? task.company ?? 'Lead';
  const title   = task.title ?? '';
  const time    = fmt(task.due_at ?? task.scheduledAt ?? null);
  const isOverdue = task.isOverdue ?? false;

  return (
    <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/8 via-card to-card p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-5 glow-primary">
      {/* Icon */}
      <div className={`h-13 w-13 rounded-xl bg-primary/15 border border-primary/30 grid place-items-center shrink-0 ${meta.accent}`}>
        <Icon size={24} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold flex items-center gap-2">
          Próxima ação
          {isOverdue && <span className="text-hot">· ATRASADA</span>}
          {time && <span className="text-muted-foreground font-mono normal-case tracking-normal">· {time}</span>}
        </div>
        <div className="mt-1 text-lg font-semibold truncate">{meta.label} · {company}</div>
        {title && (
          <div className="mt-0.5 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <Flame size={13} className="text-hot shrink-0" />
            <span>{title}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="h-9 px-4 rounded-md border border-border bg-surface text-sm hover:bg-surface-2 transition-colors"
          onClick={() => {}}
        >
          Pular
        </button>
        <button
          type="button"
          className="h-9 px-5 rounded-md bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-1.5 hover:brightness-110 transition"
          onClick={() => onExecute?.(task)}
        >
          Executar <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
