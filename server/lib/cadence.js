import { addDaysIso, dateAtLocalTime, nowIso } from './time.js';
import { parseJson, stringifyJson } from './json.js';

export const TASK_TYPES = {
  ENRICHMENT: 'ENRICHMENT',
  CALL: 'CALL',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  LINKEDIN: 'LINKEDIN',
  FOLLOW_UP: 'FOLLOW_UP',
  MEETING_CONFIRMATION: 'MEETING_CONFIRMATION',
  CLOSER_FOLLOW_UP: 'CLOSER_FOLLOW_UP'
};

export const TASK_STATUS = {
  OPEN: 'OPEN',
  DONE: 'DONE',
  SNOOZED: 'SNOOZED',
  CANCELED: 'CANCELED'
};

export const LEAD_STATES = {
  NEW: 'NEW',
  NEEDS_ENRICHMENT: 'NEEDS_ENRICHMENT',
  IN_CADENCE: 'IN_CADENCE',
  FOLLOW_UP: 'FOLLOW_UP',
  INTERESTED: 'INTERESTED',
  MEETING: 'MEETING',
  NURTURE: 'NURTURE',
  LOST: 'LOST'
};

export const OPPORTUNITY_STAGES = {
  MEETING_SCHEDULED: 'MEETING_SCHEDULED',
  MEETING_DONE: 'MEETING_DONE',
  DIAGNOSIS_DONE: 'DIAGNOSIS_DONE',
  PROPOSAL_SENT: 'PROPOSAL_SENT',
  PROPOSAL_FOLLOW_UP: 'PROPOSAL_FOLLOW_UP',
  NEGOTIATION: 'NEGOTIATION',
  CLOSED_WON: 'CLOSED_WON',
  CLOSED_LOST: 'CLOSED_LOST'
};

export const CLOUD_CADENCE_STEPS = [
  { step: 1, type: TASK_TYPES.CALL, title: 'Ligação 1', dayOffset: 0, time: '09:30', block: 'CALLS_MORNING', channel: 'phone', attempt: 1, priority: 'HIGH' },
  { step: 2, type: TASK_TYPES.WHATSAPP, title: 'WhatsApp 1', dayOffset: 1, time: '11:30', block: 'MESSAGES', channel: 'whatsapp', priority: 'MEDIUM' },
  { step: 3, type: TASK_TYPES.EMAIL, title: 'E-mail 1', dayOffset: 1, time: '11:45', block: 'MESSAGES', channel: 'email', priority: 'MEDIUM' },
  { step: 4, type: TASK_TYPES.LINKEDIN, title: 'Conexão/check LinkedIn', dayOffset: 2, time: '08:30', block: 'ENRICHMENT', channel: 'linkedin', priority: 'LOW' },
  { step: 5, type: TASK_TYPES.CALL, title: 'Ligação 2', dayOffset: 3, time: '09:30', block: 'CALLS_MORNING', channel: 'phone', attempt: 2, priority: 'HIGH' },
  { step: 6, type: TASK_TYPES.WHATSAPP, title: 'WhatsApp 2', dayOffset: 4, time: '11:30', block: 'MESSAGES', channel: 'whatsapp', priority: 'MEDIUM' },
  { step: 7, type: TASK_TYPES.EMAIL, title: 'E-mail 2', dayOffset: 4, time: '11:45', block: 'MESSAGES', channel: 'email', priority: 'MEDIUM' },
  { step: 8, type: TASK_TYPES.CALL, title: 'Ligação 3', dayOffset: 5, time: '14:00', block: 'CALLS_AFTERNOON', channel: 'phone', attempt: 3, priority: 'HIGH' },
  { step: 9, type: TASK_TYPES.CALL, title: 'Ligação final', dayOffset: 7, time: '14:00', block: 'CALLS_AFTERNOON', channel: 'phone', attempt: 'FINAL', priority: 'HIGH' },
  { step: 10, type: TASK_TYPES.WHATSAPP, title: 'Despedida e nutrição', dayOffset: 9, time: '11:30', block: 'MESSAGES', channel: 'whatsapp', priority: 'LOW', terminal: true }
];

export const EMAIL_FUNNEL_STEPS = [
  {
    step: 1,
    title: 'E-mail pós ligação',
    dayOffset: 0,
    time: '16:30',
    subject: 'Tentativa de contato - [Empresa]',
    template: 'Olá, [Nome]. Tentei falar com você por telefone porque vi que a [Empresa] pode ter espaço para estruturar melhor a geração de oportunidades comerciais. Faz sentido eu te explicar em 2 minutos?'
  },
  {
    step: 2,
    title: 'E-mail follow sem resposta',
    dayOffset: 2,
    time: '10:20',
    subject: 'Sobre geração de oportunidades na [Empresa]',
    template: 'Olá, [Nome]. Retomando meu contato: a ideia é entender se hoje a [Empresa] depende muito de indicação ou se já tem uma rotina previsível de prospecção. Se fizer sentido, marcamos um diagnóstico curto.'
  },
  {
    step: 3,
    title: 'E-mail última tentativa',
    dayOffset: 5,
    time: '10:20',
    subject: 'Encerro por aqui?',
    template: 'Olá, [Nome]. Fiz algumas tentativas de contato e não quero insistir fora de hora. Se melhorar a previsibilidade comercial for prioridade, fico à disposição para conversar.',
    terminal: true
  }
];

export function seedCadence(db) {
  const exists = db.prepare('SELECT id FROM cadences WHERE slug = ?').get('cloud-10-dias');
  if (exists) return exists.id;
  const result = db.prepare(`
    INSERT INTO cadences (slug, name, description, is_active, steps_json, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `).run(
    'cloud-10-dias',
    'Cloud 10 dias - Outbound solar',
    'Cadência fria de 10 dias com ligações, WhatsApp, e-mail e LinkedIn.',
    stringifyJson(CLOUD_CADENCE_STEPS),
    nowIso(),
    nowIso()
  );
  return result.lastInsertRowid;
}

export function createTimeline(db, leadId, eventType, title, details = {}) {
  db.prepare(`
    INSERT INTO timeline (lead_id, event_type, title, details_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(leadId, eventType, title, stringifyJson(details), nowIso());
}

export function createTask(db, { leadId, type, title, dueAt, block, priority = 'MEDIUM', cadenceStep = null, channel = null, attemptNumber = null, payload = {} }) {
  const result = db.prepare(`
    INSERT INTO tasks (lead_id, type, status, title, due_at, block, priority, cadence_step, channel, attempt_number, payload_json, created_at, updated_at)
    VALUES (?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(leadId, type, title, dueAt, block, priority, cadenceStep, channel, attemptNumber == null ? null : String(attemptNumber), stringifyJson(payload), nowIso(), nowIso());
  createTimeline(db, leadId, 'TASK_CREATED', title, { type, dueAt, block, cadenceStep, channel, attemptNumber });
  return result.lastInsertRowid;
}

export function createEnrichmentTask(db, leadId, title = 'Pesquisar e enriquecer lead', dueAt = dateAtLocalTime(0, '08:00')) {
  db.prepare('UPDATE leads SET state = ?, updated_at = ? WHERE id = ?').run(LEAD_STATES.NEEDS_ENRICHMENT, nowIso(), leadId);
  return createTask(db, {
    leadId,
    type: TASK_TYPES.ENRICHMENT,
    title,
    dueAt,
    block: 'ENRICHMENT',
    priority: 'HIGH',
    payload: { required: ['phone_found', 'decision_maker', 'pain_hypothesis'] }
  });
}

export function cadenceSteps(db) {
  const cadence = db.prepare('SELECT steps_json FROM cadences WHERE is_active = 1 ORDER BY id ASC LIMIT 1').get();
  const steps = parseJson(cadence?.steps_json, CLOUD_CADENCE_STEPS);
  return Array.isArray(steps) && steps.length ? steps : CLOUD_CADENCE_STEPS;
}

export function createNextCadenceTask(db, lead, completedStep = 0) {
  const next = cadenceSteps(db).find((step) => Number(step.step) > Number(completedStep || 0));
  if (!next) {
    db.prepare('UPDATE leads SET state = ?, updated_at = ? WHERE id = ?').run(LEAD_STATES.NURTURE, nowIso(), lead.id);
    createTimeline(db, lead.id, 'CADENCE_FINISHED', 'Cadência fria concluída', { completedStep });
    return null;
  }
  db.prepare(`
    UPDATE leads
       SET state = ?, current_cadence_step = ?, cadence_started_at = COALESCE(cadence_started_at, ?), updated_at = ?
     WHERE id = ?
  `).run(LEAD_STATES.IN_CADENCE, next.step, nowIso(), nowIso(), lead.id);
  return createTask(db, {
    leadId: lead.id,
    type: next.type,
    title: next.title,
    dueAt: dateAtLocalTime(next.dayOffset, next.time),
    block: next.block,
    priority: next.priority,
    cadenceStep: next.step,
    channel: next.channel,
    attemptNumber: next.attempt,
    payload: { terminal: Boolean(next.terminal), messageTemplate: messageTemplateForStep(next) }
  });
}

export function messageTemplateForStep(step) {
  if (step.type === TASK_TYPES.WHATSAPP && step.step === 2) {
    return 'Olá, [Nome]. Tentei falar rapidamente com você sobre estruturação comercial e Growth. Faz sentido eu te explicar em 2 minutos por aqui?';
  }
  if (step.type === TASK_TYPES.EMAIL) {
    return 'Olá, [Nome]. Trabalho com estruturação comercial para empresas B2B que querem depender menos de indicação. Faz sentido marcarmos um diagnóstico rápido?';
  }
  if (step.terminal) {
    return '[Nome], tentei contato algumas vezes e não quero ser inconveniente. Vou encerrar por aqui por enquanto. Fico à disposição.';
  }
  return '';
}

function emailFunnelStep(stepNumber = 1) {
  return EMAIL_FUNNEL_STEPS.find((step) => step.step === Number(stepNumber)) || EMAIL_FUNNEL_STEPS[0];
}

export function createEmailFunnelTask(db, leadId, reason = 'Ponte da ligação para e-mail', source = {}, stepNumber = 1, dueAt = null) {
  const step = emailFunnelStep(stepNumber);
  db.prepare('UPDATE leads SET state = ?, updated_at = ? WHERE id = ?').run(LEAD_STATES.IN_CADENCE, nowIso(), leadId);
  const eventType = step.step === 1 ? 'EMAIL_FUNNEL_ENTERED' : 'EMAIL_FUNNEL_NEXT';
  createTimeline(db, leadId, eventType, step.title, {
    reason,
    step: step.step,
    sourceTaskId: source.id,
    sourceOutcome: source.outcome
  });
  return createTask(db, {
    leadId,
    type: TASK_TYPES.EMAIL,
    title: step.title,
    dueAt: dueAt || dateAtLocalTime(step.dayOffset, step.time),
    block: 'EMAIL_FUNNEL',
    priority: step.step === 1 ? 'HIGH' : 'MEDIUM',
    channel: 'email',
    payload: {
      funnel: 'EMAIL_FUNNEL',
      emailFunnelStep: step.step,
      funnelReason: reason,
      sourceTaskId: source.id || null,
      sourceOutcome: source.outcome || null,
      terminal: Boolean(step.terminal),
      subjectTemplate: step.subject,
      messageTemplate: step.template
    }
  });
}

export function advanceEmailFunnelTask(db, task, outcome, fields = {}) {
  const payload = task.payload || parseJson(task.payload_json);
  const currentStep = Number(payload.emailFunnelStep || 1);
  if (currentStep >= EMAIL_FUNNEL_STEPS.length || payload.terminal) {
    db.prepare('UPDATE leads SET state = ?, updated_at = ? WHERE id = ?').run(LEAD_STATES.NURTURE, nowIso(), task.lead_id);
    createTimeline(db, task.lead_id, 'EMAIL_FUNNEL_FINISHED', 'Funil de e-mail concluído', { outcome, fields, currentStep });
    return null;
  }
  return createEmailFunnelTask(
    db,
    task.lead_id,
    payload.funnelReason || 'Follow do funil de e-mail',
    { id: task.id, outcome },
    currentStep + 1
  );
}

function defaultPipeline(db) {
  return db.prepare('SELECT id FROM pipelines WHERE is_default = 1 ORDER BY id ASC LIMIT 1').get()
    || db.prepare('SELECT id FROM pipelines ORDER BY id ASC LIMIT 1').get()
    || { id: null };
}

function stageForKey(db, pipelineId, stageKey) {
  if (!pipelineId) return null;
  return db.prepare('SELECT id, probability FROM pipeline_stages WHERE pipeline_id = ? AND stage_key = ?').get(pipelineId, stageKey) || null;
}

export function completeTask(db, task, outcome, fields = {}) {
  const now = nowIso();
  db.prepare(`
    UPDATE tasks
       SET status = 'DONE', outcome = ?, fields_json = ?, completed_at = ?, updated_at = ?
     WHERE id = ?
  `).run(outcome, stringifyJson(fields), now, now, task.id);
  createTimeline(db, task.lead_id, 'TASK_DONE', `${task.title}: ${outcome}`, { type: task.type, outcome, fields });
}

export function createFollowUpTask(db, leadId, dueAt, title = 'Follow-up prometido', fields = {}) {
  db.prepare('UPDATE leads SET state = ?, updated_at = ? WHERE id = ?').run(LEAD_STATES.FOLLOW_UP, nowIso(), leadId);
  return createTask(db, {
    leadId,
    type: TASK_TYPES.FOLLOW_UP,
    title,
    dueAt: dueAt || addDaysIso(nowIso(), 1, '13:30'),
    block: 'FOLLOW_UP',
    priority: 'HIGH',
    payload: fields
  });
}

export function createMeeting(db, leadId, fields = {}) {
  const meetingAt = fields.meeting_at || addDaysIso(nowIso(), 1, '09:00');
  const pipeline = defaultPipeline(db);
  const stage = stageForKey(db, pipeline.id, OPPORTUNITY_STAGES.MEETING_SCHEDULED);
  db.prepare('UPDATE leads SET state = ?, updated_at = ? WHERE id = ?').run(LEAD_STATES.MEETING, nowIso(), leadId);
  const existing = db.prepare('SELECT id FROM opportunities WHERE lead_id = ? AND stage NOT IN (?, ?)').get(leadId, OPPORTUNITY_STAGES.CLOSED_WON, OPPORTUNITY_STAGES.CLOSED_LOST);
  if (existing) {
    db.prepare('UPDATE opportunities SET pipeline_id = ?, stage_id = ?, stage = ?, probability = ?, expected_close_at = ?, updated_at = ? WHERE id = ?')
      .run(pipeline.id, stage?.id || null, OPPORTUNITY_STAGES.MEETING_SCHEDULED, stage?.probability || 35, meetingAt, nowIso(), existing.id);
  } else {
    db.prepare(`
      INSERT INTO opportunities (lead_id, pipeline_id, stage_id, title, stage, value, probability, expected_close_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(leadId, pipeline.id, stage?.id || null, fields.opportunity_title || 'Oportunidade closer', OPPORTUNITY_STAGES.MEETING_SCHEDULED, stage?.probability || 35, meetingAt, nowIso(), nowIso());
  }
  createTimeline(db, leadId, 'MEETING_SCHEDULED', 'Reunião agendada', fields);
  return createTask(db, {
    leadId,
    type: TASK_TYPES.MEETING_CONFIRMATION,
    title: 'Confirmar reunião e preparar closer',
    dueAt: meetingAt,
    block: 'MEETINGS',
    priority: 'HIGH',
    payload: fields
  });
}

export function createCloserFollowUp(db, leadId, title = 'Follow-up do closer', dueAt = addDaysIso(nowIso(), 1, '10:00'), payload = {}) {
  return createTask(db, {
    leadId,
    type: TASK_TYPES.CLOSER_FOLLOW_UP,
    title,
    dueAt,
    block: 'CLOSER',
    priority: 'HIGH',
    payload
  });
}
