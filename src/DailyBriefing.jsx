import { useMemo } from 'react';

/* ─── Frases por slot de hora ─── */
const PHRASES = {
  dawn:   [
    'Você chegou antes da maioria. Isso já é uma vantagem.',
    'Cedo é quando os pipelines se constroem. Bora.',
  ],
  morning: [
    'Cada ligação que você faz agora é dinheiro no futuro.',
    'Uma conversa pode mudar o quarter. Essa pode ser ela.',
    'Foco no processo — os resultados aparecem com consistência.',
  ],
  afternoon: [
    'Tarde é hora de colher o que a manhã plantou.',
    'Follow-up bem feito é reunião marcada. Vai lá.',
    'Você fez isso de manhã. Agora vai até o fim.',
  ],
  evening: [
    'Encerre bem o dia — o pipeline de amanhã agradece.',
    'Último sprint do dia. O que você fizer agora conta.',
  ],
};

function getTimeSlot(hour) {
  if (hour < 7)  return 'dawn';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function getGreeting(hour) {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function DailyBriefing({ dashboard, userName }) {
  const now   = new Date();
  const hour  = now.getHours();
  const min   = now.getMinutes();

  const greeting  = getGreeting(hour);
  const slot      = getTimeSlot(hour);
  const slotPhrases = PHRASES[slot];
  /* rotate phrase within the slot by 30-min windows */
  const phraseIdx = Math.floor(min / 30) % slotPhrases.length;
  const phrase    = slotPhrases[phraseIdx];

  const isMorning = hour < 12;

  const meetings         = dashboard?.meetings        ?? 0;
  const meetingsYesterday = dashboard?.meetingsYesterday ?? null;
  const callsDone        = dashboard?.callsDoneToday  ?? 0;
  const callGoal         = 50;
  const callProgress     = Math.min(100, Math.round((callsDone / callGoal) * 100));

  /* delta vs yesterday — show only when data is available */
  const meetingDelta = useMemo(() => {
    if (meetingsYesterday === null || meetingsYesterday === undefined) return null;
    const diff = meetings - meetingsYesterday;
    if (diff === 0) return null;
    return diff > 0 ? `↑${diff} vs ontem` : `↓${Math.abs(diff)} vs ontem`;
  }, [meetings, meetingsYesterday]);

  const deltaPositive = meetingDelta?.startsWith('↑');

  /* time-ticker label and color variant */
  const timeBlock = isMorning
    ? { label: '🌅 MANHÃ · LIGAÇÕES', mod: 'briefing-ticker--morning' }
    : { label: '☀️ TARDE · FOLLOW-UPS', mod: 'briefing-ticker--afternoon' };

  return (
    <div className="daily-briefing" role="banner" aria-label="Resumo do dia">

      {/* ── Time ticker faixa ── */}
      <div className={`briefing-ticker ${timeBlock.mod}`} aria-label="Bloco de tempo atual">
        <span className="briefing-ticker-label">{timeBlock.label}</span>
        <span className="briefing-ticker-time" aria-hidden="true">
          {String(hour).padStart(2,'0')}:{String(min).padStart(2,'0')}
        </span>
      </div>

      {/* ── Body ── */}
      <div className="briefing-body">

        {/* Greeting column */}
        <div className="briefing-greeting">
          <span className="briefing-eyebrow">Sales Dashboard</span>
          <h1 className="briefing-name">
            {greeting}, <strong>{userName || 'Luciano'}</strong>
          </h1>
          <p className="briefing-phrase">{phrase}</p>
        </div>

        {/* Meetings win block */}
        <div
          className="briefing-meetings-hero"
          aria-label={`${meetings} reuniões esta semana`}
        >
          <span className="briefing-meetings-label">reuniões esta semana</span>
          <div className="briefing-meetings-row">
            <strong className="briefing-meetings-value">{meetings}</strong>
            {meetingDelta && (
              <span
                className={`briefing-meetings-delta ${deltaPositive ? 'briefing-meetings-delta--up' : 'briefing-meetings-delta--down'}`}
                aria-label={meetingDelta}
              >
                {meetingDelta}
              </span>
            )}
          </div>
          <span className="briefing-meetings-sub">Meta: 5 reuniões</span>
        </div>

        {/* Calls progress */}
        <div
          className="briefing-calls-block"
          aria-label={`Ligações hoje: ${callsDone} de ${callGoal}`}
        >
          <div className="briefing-calls-header">
            <span className="briefing-calls-label">Ligações hoje</span>
            <span className="briefing-calls-count">
              <strong>{callsDone}</strong>
              <span>/{callGoal}</span>
            </span>
          </div>

          <div
            className="briefing-progress-track"
            role="progressbar"
            aria-valuenow={callsDone}
            aria-valuemin={0}
            aria-valuemax={callGoal}
          >
            <div
              className="briefing-progress-fill"
              style={{ width: `${callProgress}%` }}
            />
          </div>

          <div className="briefing-progress-footer">
            <span>{callProgress}% da meta</span>
            <span>
              {callGoal - callsDone > 0
                ? `${callGoal - callsDone} restantes`
                : '✓ Meta atingida!'}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
