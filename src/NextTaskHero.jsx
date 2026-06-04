/* NextTaskHero — o item mais importante da tela.
   Mostra a próxima tarefa com empresa, tipo, horário e botão de execução.
   Recebe `task` (objeto) e `onExecute` (callback). */

const TYPE_LABELS = {
  CALL:                   { label: 'LIGAÇÃO',        color: 'blue'   },
  WHATSAPP:               { label: 'WHATSAPP',       color: 'green'  },
  EMAIL:                  { label: 'E-MAIL',         color: 'indigo' },
  LINKEDIN:               { label: 'LINKEDIN',       color: 'indigo' },
  FOLLOW_UP:              { label: 'FOLLOW-UP',      color: 'amber'  },
  MEETING_CONFIRMATION:   { label: 'CONFIRMAÇÃO',    color: 'indigo' },
  CLOSER_FOLLOW_UP:       { label: 'FOLLOW-UP+',     color: 'green'  },
  ENRICHMENT:             { label: 'ENRICHMENT',     color: 'muted'  },
};

function formatTime(isoString) {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

export function NextTaskHero({ task, onExecute }) {
  if (!task) {
    return (
      <div className="next-task-hero next-task-hero--empty" aria-label="Nenhuma tarefa pendente">
        <span className="next-task-empty-icon" aria-hidden="true">✓</span>
        <strong className="next-task-empty-title">Tudo limpo por agora</strong>
        <p className="next-task-empty-sub">Sem tarefas pendentes na fila.</p>
      </div>
    );
  }

  const typeKey    = task.type ?? 'CALL';
  const typeInfo   = TYPE_LABELS[typeKey] ?? { label: typeKey, color: 'blue' };
  const company    = task.company ?? task.leadName ?? 'Lead';
  const contact    = task.contactName ?? null;
  const time       = formatTime(task.scheduledAt ?? task.dueAt ?? null);
  const isOverdue  = task.isOverdue ?? false;
  const isUrgent   = task.priority === 'HIGH' || isOverdue;

  return (
    <div
      className={`next-task-hero${isUrgent ? ' next-task-hero--urgent' : ''}`}
      role="region"
      aria-label="Próxima tarefa"
    >
      {/* Accent bar */}
      <div className="next-task-accent" aria-hidden="true" />

      {/* Content */}
      <div className="next-task-content">

        {/* Header row */}
        <div className="next-task-header">
          <span className="next-task-eyebrow">PRÓXIMA TAREFA</span>
          {isUrgent && (
            <span className="next-task-urgent-badge" aria-label="Urgente">
              {isOverdue ? '⚠ ATRASADA' : '🔥 URGENTE'}
            </span>
          )}
          {time && (
            <time className="next-task-time" dateTime={task.scheduledAt ?? task.dueAt}>
              {time}
            </time>
          )}
        </div>

        {/* Main info */}
        <div className="next-task-main">
          <div className="next-task-info">
            <span className={`next-task-type-badge next-task-type-badge--${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            <strong className="next-task-company">{company}</strong>
            {contact && (
              <span className="next-task-contact">{contact}</span>
            )}
          </div>

          <button
            className="next-task-execute-btn"
            onClick={() => onExecute?.(task)}
            type="button"
            aria-label={`Executar tarefa: ${typeInfo.label} para ${company}`}
          >
            Executar →
          </button>
        </div>

      </div>
    </div>
  );
}
