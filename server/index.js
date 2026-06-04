import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from 'dotenv';
import { db, initDb, setSetting } from './lib/db.js';
import { importWorkbook } from './lib/importer.js';
import { parseJson, stringifyJson } from './lib/json.js';
import {
  completeTask,
  advanceEmailFunnelTask,
  createCloserFollowUp,
  createEmailFunnelTask,
  createEnrichmentTask,
  createFollowUpTask,
  createMeeting,
  createNextCadenceTask,
  createTask,
  createTimeline,
  LEAD_STATES,
  OPPORTUNITY_STAGES,
  TASK_TYPES
} from './lib/cadence.js';
import { addDaysIso, dateAtLocalTime, endOfTodayIso, nowIso, startOfTodayIso } from './lib/time.js';
import { persistIntegrationEvent, qualificationIdFor, qualifyManualCall, startManualCall, threeCApiGet, threeCConfig, THREEC_QUALIFICATION_MAP, fetchThreeCCalls } from './lib/threec.js';
import { importCsvDirectory } from './lib/csv-importer.js';

config();
initDb();
await importWorkbook();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

const PORT = Number(process.env.PORT || 5184);
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';
const AUTH_USER = process.env.BDR_AUTH_USER || 'bdr';
const AUTH_PASSWORD = process.env.BDR_AUTH_PASSWORD || 'cloudbdr2026';
const AUTH_COOKIE = process.env.AUTH_COOKIE_NAME || 'cloud_bdr_session';
const AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_SESSION_HOURS = Number(process.env.AUTH_SESSION_HOURS || 18);
const AUTH_MAX_AGE_MS = AUTH_SESSION_HOURS * 60 * 60 * 1000;

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator === -1) return [part, ''];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      })
  );
}

function signSessionPayload(payload) {
  return crypto.createHmac('sha256', AUTH_SESSION_SECRET).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createSessionToken(username) {
  const payload = Buffer.from(JSON.stringify({
    username,
    exp: Date.now() + AUTH_MAX_AGE_MS
  })).toString('base64url');
  return `${payload}.${signSessionPayload(payload)}`;
}

function readSession(req) {
  if (!AUTH_ENABLED) return { username: AUTH_USER };
  const token = parseCookies(req.headers.cookie)[AUTH_COOKIE];
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!safeEqual(signature, signSessionPayload(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session?.username || !session?.exp || session.exp < Date.now()) return null;
    return { username: session.username };
  } catch {
    return null;
  }
}

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.AUTH_COOKIE_SECURE === 'true';
}

function sessionCookie(token, req) {
  const parts = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(AUTH_MAX_AGE_MS / 1000)}`
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie(req) {
  const parts = [
    `${AUTH_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function requireAuth(req, res, next) {
  if (!AUTH_ENABLED) return next();
  if (req.path === '/health' || req.path.startsWith('/auth/')) return next();
  if (req.method === 'POST' && req.path === '/integrations/3c/webhook') return next();
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Login obrigatório' });
  req.user = session;
  return next();
}

function rowToTask(row) {
  if (!row) return null;
  return {
    ...row,
    payload: parseJson(row.payload_json),
    fields: parseJson(row.fields_json)
  };
}

function taskSelect(where = '', params = []) {
  return db.prepare(`
    SELECT
      t.*,
      l.state AS lead_state,
      l.current_cadence_step,
      c.id AS company_id,
      c.cnpj,
      c.legal_name,
      c.trade_name,
      c.city,
      c.cnae,
      ct.id AS contact_id,
      ct.name AS contact_name,
      ct.role AS contact_role,
      p.phone AS primary_phone
    FROM tasks t
    JOIN leads l ON l.id = t.lead_id
    JOIN companies c ON c.id = l.company_id
    LEFT JOIN contacts ct ON ct.company_id = c.id AND ct.is_primary = 1
    LEFT JOIN phones p ON p.id = (
      SELECT id
      FROM phones
      WHERE company_id = c.id
      ORDER BY do_not_call ASC, CASE WHEN is_valid = 0 THEN 1 ELSE 0 END, priority ASC, id ASC
      LIMIT 1
    )
    ${where}
    ORDER BY
      CASE t.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
      t.due_at ASC,
      t.id ASC
  `).all(...params).map(rowToTask);
}

function getTask(id) {
  return taskSelect('WHERE t.id = ?', [id])[0];
}

function getLeadBundle(id) {
  const lead = db.prepare(`
    SELECT l.*, c.cnpj, c.legal_name, c.trade_name, c.opened_at, c.cnae, c.city, c.raw_json
    FROM leads l
    JOIN companies c ON c.id = l.company_id
    WHERE l.id = ?
  `).get(id);
  if (!lead) return null;
  const timeline = db.prepare('SELECT * FROM timeline WHERE lead_id = ? ORDER BY created_at DESC, id DESC LIMIT 80').all(id).map((row) => ({ ...row, details: parseJson(row.details_json) }));
  const notes = db.prepare('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC, id DESC LIMIT 25').all(id);
  return {
    ...lead,
    enrichment: parseJson(lead.enrichment_json),
    rawData: parseJson(lead.raw_json),
    contacts: db.prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY is_primary DESC, id ASC').all(lead.company_id),
    phones: db.prepare('SELECT * FROM phones WHERE company_id = ? ORDER BY do_not_call ASC, CASE WHEN is_valid = 0 THEN 1 ELSE 0 END, priority ASC, id ASC').all(lead.company_id),
    openTasks: db.prepare('SELECT * FROM tasks WHERE lead_id = ? AND status = ? ORDER BY due_at ASC').all(id, 'OPEN').map(rowToTask),
    timeline,
    notes,
    recentContext: latestLeadContext(timeline, notes),
    opportunities: db.prepare('SELECT * FROM opportunities WHERE lead_id = ? ORDER BY created_at DESC').all(id),
    recordings: db.prepare(`
      SELECT id, call_id, phone, classification, qualification, recording_url, duration_seconds, ended_at, started_at as created_at
      FROM calls WHERE lead_id = ?
      ORDER BY started_at DESC LIMIT 20
    `).all(id)
  };
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhoneForLookup(value) {
  let phone = normalizeDigits(value);
  if (phone.startsWith('55') && [12, 13].includes(phone.length)) phone = phone.slice(2);
  return phone;
}

function normalizeLookupKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function deepFindByKey(source, aliases, depth = 0) {
  if (!source || typeof source !== 'object' || depth > 7) return '';
  const wanted = new Set(aliases.map(normalizeLookupKey));
  if (Array.isArray(source)) {
    for (const item of source) {
      const found = deepFindByKey(item, aliases, depth + 1);
      if (found !== '') return found;
    }
    return '';
  }
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(normalizeLookupKey(key)) && value !== null && value !== '') return value;
  }
  for (const value of Object.values(source)) {
    const found = deepFindByKey(value, aliases, depth + 1);
    if (found !== '') return found;
  }
  return '';
}

function pickPath(source, paths, fallback = '') {
  for (const path of paths) {
    const parts = path.split('.');
    let current = source;
    let found = true;
    for (const part of parts) {
      if (!current || typeof current !== 'object' || !(part in current)) {
        found = false;
        break;
      }
      current = current[part];
    }
    if (found && current !== null && current !== '') return current;
  }
  return fallback;
}

function textValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return String(value.name || value.text || value.label || value.title || value.value || '');
  }
  return String(value);
}

function sanitizeWebhookPayload(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeWebhookPayload(item));
  if (!value || typeof value !== 'object') return value;
  const secretKey = /(token|password|secret|authorization|api[_-]?key)/i;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    secretKey.test(key) ? '[REDACTED]' : sanitizeWebhookPayload(item)
  ]));
}

function unwrapThreeCPayload(payload = {}) {
  if (payload['call-history-was-created']) {
    return { eventType: 'call-history-was-created', data: payload['call-history-was-created'] };
  }
  if (payload['call-was-connected']) {
    return { eventType: 'call-was-connected', data: payload['call-was-connected'] };
  }
  const eventType = payload.event || payload.event_name || payload.event_type || payload.type || payload.name || payload.action || payload.hook || payload.trigger
    || payload.data?.event || payload.data?.type || payload.payload?.event || payload.payload?.type || 'unknown';
  return { eventType: String(eventType || 'unknown'), data: payload };
}

function classifyThreeCQualification(text, eventType = '') {
  const value = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!value && eventType === 'call-was-connected') return { classification: 'connected', outcome: '', label: 'Conectou' };
  if (/agend|reuniao|reuniao marcada|diagnostico/.test(value)) return { classification: 'meeting', outcome: 'meeting_scheduled', label: 'Agendamento' };
  if (/follow|retorno|retornar|callback|ligar depois|mais tarde|amanha|segunda|terca|quarta|quinta|sexta/.test(value)) return { classification: 'follow', outcome: 'callback_requested', label: 'Follow/retorno' };
  if (/fora do icp|sem fit|fora fit/.test(value)) return { classification: 'out_of_icp', outcome: 'out_of_icp', label: 'Fora do ICP' };
  if (/telefone invalido|numero invalido|invalido|nao existe|nao chama|fora de servico|bloqueado|unallocated|unassigned|numero nao atribuido|numero inexistente|precisa buscar novo telefone|buscar novo telefone/.test(value)) return { classification: 'phone_invalid', outcome: 'phone_invalid', label: 'Telefone inválido' };
  if (/nao e|nao pertence|sem vinculo|telefone errado|numero errado|nao conhece|nao trabalha|nao e dono|sem ligacao com/.test(value)) return { classification: 'phone_no_link', outcome: 'phone_invalid', label: 'Telefone sem vínculo' };
  if (/sem interesse|declinou|nao quer|nao tem interesse|recusou|rejeitou/.test(value)) return { classification: 'not_interested', outcome: 'not_interested', label: 'Sem interesse' };
  if (/secretaria|recepcao|recepcionista|gatekeeper|atendente|portaria|comercial atendeu/.test(value)) return { classification: 'gatekeeper', outcome: 'gatekeeper', label: 'Gatekeeper' };
  if (/email|e-mail|mandar material|material|proposta por email/.test(value)) return { classification: 'email', outcome: 'email_only', label: 'Direcionou para e-mail' };
  if (/whatsapp|zap|wpp/.test(value)) return { classification: 'whatsapp', outcome: 'whatsapp_negotiation', label: 'Direcionou para WhatsApp' };
  if (/caixa postal|voicemail/.test(value)) return { classification: 'voicemail', outcome: 'voicemail', label: 'Caixa postal' };
  if (/nao atendeu|sem contato|sem resposta|ocupado|caiu|ligacao caiu|chamada perdida|nao completou|nao conectou|outgoing calls barred|barred|cancel\s*\/?\s*487|chamada barrada|falha|failed|failure|rejected|busy|no answer|hangup|discar denovo|discar de novo|mudo/.test(value)) return { classification: 'no_answer', outcome: 'no_answer', label: 'Não conectou' };
  if (/atendeu|conectou|conectada|answered|connected/.test(value)) return { classification: 'connected', outcome: '', label: 'Conectou' };
  return { classification: value ? 'unknown' : 'unknown', outcome: '', label: text || 'Sem tabulação' };
}

function extractThreeCWebhook(payload = {}) {
  const { eventType, data } = unwrapThreeCPayload(payload);
  const callHistory = data.callHistory || data.call_history || data.call || data.data?.call || data.payload?.call || data;
  const mailingData = callHistory?.mailing_data?.data || data.mailing_data?.data || data.mailing?.data || data.data?.mailing_data?.data || data.data?.mailing?.data || {};
  const merged = { ...payload, ...data, callHistory, mailingData };
  const callId = String(
    pickPath(payload, [
      'call-history-was-created.callHistory._id',
      'call-history-was-created.callHistory.id',
      'call-history-was-created.call.id',
      'call-was-connected.callHistory._id',
      'call-was-connected.callHistory.id',
      'call-was-connected.call.id',
      'callHistory._id',
      'callHistory.id',
      'call.id',
      'data.call.id',
      'payload.call.id',
      'call_id',
      'callId'
    ], '') || deepFindByKey(merged, ['call_id', 'callId', 'callid', 'callHistoryId'])
  );
  const sid = String(pickPath(payload, [
    'call-history-was-created.callHistory.sid',
    'call-was-connected.callHistory.sid',
    'call-was-connected.call.sid',
    'call.sid',
    'data.call.sid',
    'sid',
    'call_sid'
  ], '') || deepFindByKey(merged, ['sid', 'call_sid', 'callSid']));
  const phone = normalizePhoneForLookup(
    pickPath(payload, [
      'phone',
      'number',
      'phone_number',
      'customer_phone',
      'data.phone',
      'data.number',
      'payload.phone',
      'call.phone',
      'call.number',
      'call-history-was-created.callHistory.number',
      'call-history-was-created.callHistory.phone',
      'call-history-was-created.callHistory.mailing_data.data.DDD + Telefone',
      'call-history-was-created.callHistory.mailing_data.data.Telefone_Original',
      'call-history-was-created.callHistory.route.caller_id',
      'call-was-connected.callHistory.number',
      'call-was-connected.callHistory.phone',
      'call-was-connected.call.phone',
      'call-was-connected.call.number',
      'call-was-connected.mailing.phone',
      'call-was-connected.callHistory.mailing_data.data.DDD + Telefone',
      'call-was-connected.callHistory.mailing_data.data.Telefone_Original',
      'call-was-connected.mailing.data.DDD + Telefone',
      'call-was-connected.mailing.data.Telefone_Original',
      'call-was-connected.callHistory.route.caller_id'
    ], '') || deepFindByKey(mailingData, ['DDD + Telefone', 'Telefone_Original', 'telefone', 'phone', 'number'])
  );
  const qualification = textValue(
    pickPath(payload, [
      'qualification',
      'outcome',
      'status',
      'disposition',
      'result',
      'data.qualification',
      'data.outcome',
      'data.status',
      'payload.qualification',
      'call-history-was-created.callHistory.qualification.name',
      'call-history-was-created.hangupCause.text',
      'call-history-was-created.callHistory.status',
      'call-history-was-created.callHistory.qualification_note',
      'call-was-connected.callHistory.qualification.name',
      'call-was-connected.hangupCause.text',
      'call-was-connected.callHistory.status',
      'call-was-connected.callHistory.qualification_note'
    ], '') || deepFindByKey(merged, ['qualification_name', 'qualificationName', 'outcome', 'disposition', 'result', 'hangupCause', 'status'])
  );
  const qualificationId = String(deepFindByKey(merged, ['qualification_id', 'qualificationId', 'qualificationListId', 'qualification_list_id']));
  const note = textValue(
    pickPath(payload, [
      'note',
      'notes',
      'qualification_note',
      'data.note',
      'data.qualification_note',
      'payload.note',
      'call-history-was-created.callHistory.qualification_note',
      'call-history-was-created.callHistory.call_issues',
      'call-was-connected.callHistory.qualification_note',
      'call-was-connected.callHistory.call_issues'
    ], '') || deepFindByKey(merged, ['note', 'notes', 'qualification_note', 'observation', 'comments'])
  );
  const leadId = Number(deepFindByKey(mailingData, ['Lead_ID', 'lead_id', 'leadId']) || deepFindByKey(merged, ['Lead_ID', 'lead_id', 'leadId']) || 0) || null;
  const taskId = Number(deepFindByKey(mailingData, ['Task_ID', 'task_id', 'taskId']) || deepFindByKey(merged, ['Task_ID', 'task_id', 'taskId']) || 0) || null;
  const cnpj = normalizeDigits(deepFindByKey(mailingData, ['CNPJ', 'cnpj', 'Identificador']) || deepFindByKey(merged, ['CNPJ', 'cnpj', 'Identificador']));
  const company = String(deepFindByKey(mailingData, ['Empresa', 'company', 'company_name', 'razao_social']) || deepFindByKey(merged, ['Empresa', 'company', 'company_name', 'razao_social']) || '');
  const contact = String(deepFindByKey(mailingData, ['Nome', 'contact', 'contact_name', 'nome']) || deepFindByKey(merged, ['Nome', 'contact', 'contact_name', 'nome']) || '');
  const scheduleAt = String(deepFindByKey(merged, ['schedule_at', 'scheduled_at', 'scheduleAt', 'date', 'return_at', 'callback_at']) || '');
  const duration = Number(deepFindByKey(merged, ['duration', 'duration_seconds', 'speaking_time', 'speaking_with_agent_time', 'billed_time', 'calling_time']) || 0) || null;
  const agentTalkTime = Number(deepFindByKey(merged, ['speaking_with_agent_time']) || 0) || 0;
  const amdLabel = textValue(deepFindByKey(merged, ['amd_v3_label', 'amd_status', 'amd_v3_code']));
  const recordingUrl = String(deepFindByKey(merged, ['recording_url', 'record_url', 'audio_url', 'recording']) || '');
  let category = classifyThreeCQualification(`${qualification} ${note}`.trim(), eventType);
  if (eventType === 'call-was-connected') {
    category = { classification: 'connected', outcome: '', label: 'Conectou' };
  }
  if (eventType === 'call-history-was-created' && category.classification === 'unknown') {
    const historySignal = `${qualification} ${note} ${amdLabel}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/unallocated|unassigned|numero nao atribuido|numero inexistente/.test(historySignal)) {
      category = { classification: 'phone_invalid', outcome: 'phone_invalid', label: 'Telefone inválido' };
    } else if (/voicemail|caixa postal|ios_voicemail/.test(historySignal)) {
      category = { classification: 'voicemail', outcome: 'voicemail', label: 'Caixa postal' };
    } else if (/normal clearing/.test(historySignal) && agentTalkTime > 0) {
      category = { classification: 'connected', outcome: '', label: 'Conectou' };
    } else if (/normal clearing/.test(historySignal) || agentTalkTime === 0) {
      category = { classification: 'no_answer', outcome: 'no_answer', label: 'Não conectou' };
    }
  }
  // Override classification with known qualification IDs (more reliable than text matching)
  if (qualificationId && THREEC_QUALIFICATION_MAP[qualificationId]) {
    const qmap = THREEC_QUALIFICATION_MAP[qualificationId];
    category = { classification: qmap.classification, outcome: qmap.outcome, label: qmap.label };
  }

  return {
    eventType,
    callId: callId || null,
    sid: sid || null,
    phone: phone || null,
    qualification: qualification || note || '',
    qualificationId: qualificationId || null,
    note,
    leadId,
    taskId,
    cnpj,
    company,
    contact,
    scheduleAt,
    duration,
    agentTalkTime,
    recordingUrl,
    classification: category.classification,
    outcome: category.outcome,
    classificationLabel: category.label,
    payload
  };
}

function leadIdFromThreeCEvent(event) {
  if (event.leadId && db.prepare('SELECT id FROM leads WHERE id = ?').get(event.leadId)) return event.leadId;
  if (event.taskId) {
    const task = db.prepare('SELECT lead_id FROM tasks WHERE id = ?').get(event.taskId);
    if (task?.lead_id) return task.lead_id;
  }
  if (event.phone) {
    const byPhone = db.prepare(`
      SELECT l.id
      FROM phones p
      JOIN leads l ON l.company_id = p.company_id
      WHERE p.phone = ?
      ORDER BY p.do_not_call ASC, p.priority ASC, p.id ASC
      LIMIT 1
    `).get(event.phone);
    if (byPhone?.id) return byPhone.id;
  }
  if (event.cnpj) {
    const byCnpj = db.prepare('SELECT l.id FROM leads l JOIN companies c ON c.id = l.company_id WHERE c.cnpj = ? LIMIT 1').get(event.cnpj);
    if (byCnpj?.id) return byCnpj.id;
  }
  return null;
}

function openTaskForThreeC(leadId, event) {
  if (event.taskId) {
    const task = getTask(event.taskId);
    if (task?.status === 'OPEN') return task;
  }
  if (!leadId) return null;
  return taskSelect("WHERE t.status = 'OPEN' AND t.lead_id = ? AND t.type = ?", [leadId, TASK_TYPES.CALL])[0] || null;
}

function updateThreeCCallRecord(event, leadId, taskId = null, status = 'received') {
  const callKey = event.callId || event.sid || `${event.phone || 'sem-telefone'}:${event.eventType}:${Date.now()}`;
  db.prepare(`
    INSERT INTO calls (lead_id, task_id, call_id, sid, phone, status, recording_url, payload_json, classification, qualification, qualification_id, duration_seconds, ended_at, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(call_id) DO UPDATE SET
      lead_id = COALESCE(excluded.lead_id, calls.lead_id),
      task_id = COALESCE(excluded.task_id, calls.task_id),
      sid = COALESCE(excluded.sid, calls.sid),
      phone = COALESCE(excluded.phone, calls.phone),
      status = excluded.status,
      recording_url = COALESCE(excluded.recording_url, calls.recording_url),
      payload_json = excluded.payload_json,
      classification = COALESCE(excluded.classification, calls.classification),
      qualification = COALESCE(excluded.qualification, calls.qualification),
      qualification_id = COALESCE(excluded.qualification_id, calls.qualification_id),
      duration_seconds = COALESCE(excluded.duration_seconds, calls.duration_seconds),
      ended_at = COALESCE(excluded.ended_at, calls.ended_at),
      updated_at = excluded.updated_at
  `).run(
    leadId || null,
    taskId || null,
    callKey,
    event.sid,
    event.phone || '',
    status,
    event.recordingUrl || null,
    stringifyJson(event.payload),
    event.classification,
    event.qualification || event.note || '',
    event.qualificationId,
    event.duration,
    event.eventType === 'call-history-was-created' ? nowIso() : null,
    nowIso(),
    nowIso()
  );
}

function updatePhoneFromThreeC(leadId, event) {
  if (!leadId || !event.phone) return;
  const lead = db.prepare('SELECT company_id FROM leads WHERE id = ?').get(leadId);
  if (!lead) return;
  const statusByClassification = {
    phone_invalid: 'INVALID',
    phone_no_link: 'NO_LINK',
    gatekeeper: 'GATEKEEPER',
    no_answer: 'NO_ANSWER',
    voicemail: 'NO_ANSWER',
    connected: 'CONTACTED',
    meeting: 'CONTACTED',
    follow: 'CONTACTED',
    not_interested: 'CONTACTED'
  };
  const relationshipByClassification = {
    phone_invalid: 'INVALID',
    phone_no_link: 'NO_LINK',
    gatekeeper: 'GATEKEEPER'
  };
  const status = statusByClassification[event.classification] || 'CONTACTED';
  const relationship = relationshipByClassification[event.classification] || 'UNKNOWN';
  const doNotCall = ['INVALID', 'NO_LINK'].includes(status) ? 1 : 0;
  db.prepare(`
    INSERT INTO phones (company_id, phone, source, is_valid, status, relationship, owner_name, do_not_call, validation_note, last_validated_at, priority, created_at, updated_at)
    VALUES (?, ?, '3C+ webhook', ?, ?, ?, ?, ?, ?, ?, 100, ?, ?)
    ON CONFLICT(company_id, phone) DO UPDATE SET
      is_valid = excluded.is_valid,
      status = excluded.status,
      relationship = excluded.relationship,
      owner_name = COALESCE(excluded.owner_name, phones.owner_name),
      do_not_call = CASE WHEN excluded.do_not_call = 1 THEN 1 ELSE phones.do_not_call END,
      validation_note = COALESCE(excluded.validation_note, phones.validation_note),
      last_validated_at = excluded.last_validated_at,
      updated_at = excluded.updated_at
  `).run(
    lead.company_id,
    event.phone,
    status === 'INVALID' || status === 'NO_LINK' ? 0 : 1,
    status,
    relationship,
    event.contact || null,
    doNotCall,
    [event.classificationLabel, event.qualification, event.note].filter(Boolean).join(' | ') || null,
    nowIso(),
    nowIso(),
    nowIso()
  );
}

function parseThreeCScheduleDate(value) {
  if (!value) return '';
  const text = String(value).trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return '';
}

function noteForThreeCEvent(event) {
  return [
    `3C+ ${event.classificationLabel || event.classification}`,
    event.phone ? `Telefone: ${event.phone}` : '',
    event.qualification ? `Tabulação: ${event.qualification}` : '',
    event.note ? `Nota: ${event.note}` : '',
    event.duration ? `Duração: ${event.duration}s` : '',
    event.callId ? `Call ID: ${event.callId}` : ''
  ].filter(Boolean).join('\n');
}

function processThreeCWebhook(payload = {}) {
  const event = extractThreeCWebhook(payload);
  event.payload = sanitizeWebhookPayload(payload);
  const hash = crypto.createHash('sha1').update(JSON.stringify(event.payload)).digest('hex').slice(0, 16);
  const eventKey = `3c:${event.eventType}:${event.callId || event.sid || hash}`;
  const existing = db.prepare('SELECT id, status FROM integration_events WHERE event_key = ?').get(eventKey);
  if (existing && existing.status !== 'failed') {
    return { ok: true, duplicate: true, event, eventId: existing.id, eventKey };
  }
  const leadId = leadIdFromThreeCEvent(event);
  const openTask = openTaskForThreeC(leadId, event);
  const isFinalEvent = event.eventType === 'call-history-was-created' || event.classification !== 'connected';

  db.exec('BEGIN');
  try {
    updateThreeCCallRecord(event, leadId, openTask?.id || event.taskId, isFinalEvent ? 'finished' : 'connected');
    const inserted = persistIntegrationEvent(db, {
      eventKey,
      eventType: event.eventType,
      leadId,
      callId: event.callId,
      sid: event.sid,
      phone: event.phone,
      classification: event.classification,
      qualification: event.qualification || event.note || '',
      payload: event.payload,
      status: leadId ? 'processed' : 'unmatched'
    });

    if (leadId) {
      updatePhoneFromThreeC(leadId, event);
      createTimeline(db, leadId, 'THREEC_CALL_EVENT', `3C+: ${event.classificationLabel}`, {
        eventType: event.eventType,
        classification: event.classification,
        outcome: event.outcome,
        phone: event.phone,
        qualification: event.qualification,
        note: event.note,
        callId: event.callId,
        sid: event.sid
      });
      recordLeadNote(leadId, openTask?.id || null, noteForThreeCEvent(event), `3C:${event.classification}`);

      if (isFinalEvent && event.outcome && openTask?.type === TASK_TYPES.CALL) {
        const fields = {
          phone: event.phone || openTask.primary_phone,
          conversation_note: noteForThreeCEvent(event),
          reason: event.qualification || event.note || event.classificationLabel,
          followup_at: parseThreeCScheduleDate(event.scheduleAt) || addDaysIso(nowIso(), 1, '10:00'),
          meeting_at: parseThreeCScheduleDate(event.scheduleAt) || addDaysIso(nowIso(), 1, '10:00'),
          call_id: event.callId || event.sid || '',
          call_significance: ['meeting', 'follow', 'gatekeeper', 'connected'].includes(event.classification) ? 'SIGNIFICANT' : 'NON_SIGNIFICANT'
        };
        completeTask(db, openTask, event.outcome, fields);
        persistTaskContext(openTask, event.outcome, fields);
        updatePhoneValidation(openTask, event.outcome, fields);
        advanceAfterTask(openTask, event.outcome, fields);
      } else if (isFinalEvent && !openTask) {
        if (event.classification === 'meeting') {
          cancelOpenTasks(leadId);
          createMeeting(db, leadId, {
            phone: event.phone,
            meeting_at: parseThreeCScheduleDate(event.scheduleAt) || addDaysIso(nowIso(), 1, '10:00'),
            closer_briefing: noteForThreeCEvent(event)
          });
        }
        if (event.classification === 'follow') {
          cancelOpenTasks(leadId);
          createFollowUpTask(db, leadId, parseThreeCScheduleDate(event.scheduleAt) || addDaysIso(nowIso(), 1, '10:00'), 'Retorno 3C+', {
            phone: event.phone,
            promised_by: event.contact || '',
            conversation_note: noteForThreeCEvent(event)
          });
        }
        if (event.classification === 'whatsapp') {
          cancelOpenTasks(leadId);
          createImmediateWhatsAppTask(leadId, 'WhatsApp - Pediu material 3C+', {
            phone: event.phone,
            conversation_note: noteForThreeCEvent(event)
          });
        }
        if (['phone_invalid', 'phone_no_link'].includes(event.classification)) {
          const hasOpenEnrichment = db.prepare("SELECT id FROM tasks WHERE lead_id = ? AND type = ? AND status = 'OPEN' LIMIT 1").get(leadId, TASK_TYPES.ENRICHMENT);
          if (!hasOpenEnrichment) createEnrichmentTask(db, leadId, 'Pesquisar novo telefone após 3C+', dateAtLocalTime(0, '08:00'));
        }
      }
    }

    db.exec('COMMIT');
    return { ok: true, event, leadId, eventId: inserted?.id || null, taskId: openTask?.id || null, eventKey };
  } catch (error) {
    db.exec('ROLLBACK');
    persistIntegrationEvent(db, {
      eventKey,
      eventType: event.eventType,
      leadId,
      callId: event.callId,
      sid: event.sid,
      phone: event.phone,
      classification: event.classification,
      qualification: event.qualification || event.note || '',
      payload: event.payload,
      status: 'failed',
      error: error.message
    });
    throw error;
  }
}

function latestLeadContext(timeline, notes) {
  const taskNotes = timeline
    .filter((event) => event.event_type === 'TASK_DONE')
    .map((event) => ({
      created_at: event.created_at,
      title: event.title,
      note: event.details?.fields?.conversation_note || event.details?.fields?.notes || event.details?.fields?.reason || '',
      outcome: event.details?.outcome
    }))
    .filter((item) => item.note);
  const seen = new Set();
  return [...notes.map((note) => ({ created_at: note.created_at, title: note.note_type, note: note.body })), ...taskNotes]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter((item) => {
      const key = String(item.note || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function recordLeadNote(leadId, taskId, body, noteType = 'NOTE') {
  const text = String(body || '').trim();
  if (!text) return null;
  const result = db.prepare(`
    INSERT INTO lead_notes (lead_id, task_id, note_type, body, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(leadId, taskId || null, noteType, text, nowIso());
  return result.lastInsertRowid;
}

function persistTaskContext(task, outcome, fields = {}) {
  const fragments = [];
  if (fields.conversation_note) fragments.push(fields.conversation_note);
  if (fields.notes && fields.notes !== fields.conversation_note) fragments.push(fields.notes);
  if (fields.reason && !String(fields.conversation_note || '').includes(fields.reason)) fragments.push(`Motivo/objeção: ${fields.reason}`);
  if (fields.pain_hypothesis) fragments.push(`Dor: ${fields.pain_hypothesis}`);
  if (fields.rapport) fragments.push(`Rapport: ${fields.rapport}`);
  if (fragments.length) recordLeadNote(task.lead_id, task.id, fragments.join('\n'), `${task.type}:${outcome}`);
}

function updatePhoneValidation(task, outcome, fields = {}) {
  if (task.type !== TASK_TYPES.CALL) return;
  const phone = normalizeDigits(fields.phone || task.primary_phone);
  if (phone.length < 10) return;
  const lead = db.prepare('SELECT company_id FROM leads WHERE id = ?').get(task.lead_id);
  if (!lead) return;
  const relationship = fields.phone_relationship || (outcome === 'phone_invalid' ? 'INVALID' : '');
  const status = fields.phone_status || (
    outcome === 'phone_invalid' ? 'INVALID'
      : relationship === 'DECISION_MAKER' ? 'VALID_DECISION_MAKER'
        : relationship === 'NO_LINK' ? 'NO_LINK'
          : relationship === 'GATEKEEPER' ? 'GATEKEEPER'
            : ''
  );
  const shouldUpdate = status || relationship || fields.phone_owner_name || fields.phone_validation_note || fields.phone_do_not_call;
  if (!shouldUpdate) return;
  const doNotCall = fields.phone_do_not_call || status === 'INVALID' || status === 'NO_LINK' ? 1 : 0;
  const maxPriority = db.prepare('SELECT COALESCE(MAX(priority), 0) AS max FROM phones WHERE company_id = ?').get(lead.company_id).max;
  db.prepare(`
    INSERT INTO phones (company_id, phone, source, is_valid, status, relationship, owner_name, do_not_call, validation_note, last_validated_at, validated_by_task_id, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, phone) DO UPDATE SET
      is_valid = excluded.is_valid,
      status = excluded.status,
      relationship = excluded.relationship,
      owner_name = COALESCE(excluded.owner_name, phones.owner_name),
      do_not_call = excluded.do_not_call,
      validation_note = COALESCE(excluded.validation_note, phones.validation_note),
      last_validated_at = excluded.last_validated_at,
      validated_by_task_id = excluded.validated_by_task_id,
      priority = CASE WHEN excluded.relationship = 'DECISION_MAKER' THEN 0 ELSE phones.priority END,
      updated_at = excluded.updated_at
  `).run(
    lead.company_id,
    phone,
    'Validação em ligação',
    status === 'INVALID' || status === 'NO_LINK' ? 0 : 1,
    status || 'CONTACTED',
    relationship || 'UNKNOWN',
    fields.phone_owner_name || null,
    doNotCall,
    fields.phone_validation_note || null,
    nowIso(),
    task.id,
    relationship === 'DECISION_MAKER' ? 0 : maxPriority + 1,
    nowIso(),
    nowIso()
  );
  createTimeline(db, task.lead_id, 'PHONE_VALIDATED', `Telefone ${phone}: ${status || relationship}`, {
    phone,
    status,
    relationship,
    ownerName: fields.phone_owner_name,
    doNotCall,
    note: fields.phone_validation_note
  });
}

function updateLeadEnrichment(leadId, fields) {
  const current = db.prepare('SELECT enrichment_json FROM leads WHERE id = ?').get(leadId);
  const enrichment = { ...parseJson(current?.enrichment_json), ...fields };
  db.prepare('UPDATE leads SET enrichment_json = ?, updated_at = ? WHERE id = ?').run(stringifyJson(enrichment), nowIso(), leadId);
  if (fields.phone_found) {
    const lead = db.prepare('SELECT company_id FROM leads WHERE id = ?').get(leadId);
    const digits = String(fields.phone_found).replace(/\D/g, '');
    if (digits.length >= 10) {
      const maxPriority = db.prepare('SELECT COALESCE(MAX(priority), 0) AS max FROM phones WHERE company_id = ?').get(lead.company_id).max;
      db.prepare(`
        INSERT INTO phones (company_id, phone, source, is_valid, status, relationship, priority, created_at, updated_at)
        VALUES (?, ?, ?, 1, 'ENRICHED_UNVALIDATED', 'UNKNOWN', ?, ?, ?)
        ON CONFLICT(company_id, phone) DO UPDATE SET is_valid = 1, status = 'ENRICHED_UNVALIDATED', source = excluded.source, updated_at = excluded.updated_at
      `).run(lead.company_id, digits, fields.phone_source || 'Enriquecimento BDR', maxPriority + 1, nowIso(), nowIso());
    }
  }
}

function loseLead(leadId, reason, title = 'Lead encerrado') {
  db.prepare('UPDATE leads SET state = ?, lost_reason = ?, updated_at = ? WHERE id = ?').run(LEAD_STATES.LOST, reason, nowIso(), leadId);
  createTimeline(db, leadId, 'LEAD_LOST', title, { reason });
}

function cancelOpenTasks(leadId) {
  db.prepare("UPDATE tasks SET status = 'CANCELED', updated_at = ? WHERE lead_id = ? AND status = 'OPEN'").run(nowIso(), leadId);
}

function emailFunnelReason(outcome, fields = {}, task = {}) {
  const reasons = {
    email_only: 'Contato pediu tratamento por e-mail',
    material_requested: 'Decisor pediu material antes de seguir',
    gatekeeper_email: 'Gatekeeper direcionou para e-mail',
    no_answer: `Sem conexão após ligação ${task.attempt_number || ''}`.trim(),
    voicemail: `Caixa postal após ligação ${task.attempt_number || ''}`.trim(),
    call_dropped: `Ligação caiu após tentativa ${task.attempt_number || ''}`.trim()
  };
  return fields.email_funnel_reason || reasons[outcome] || 'Ponte da ligação para e-mail';
}

function shouldMoveCallToEmailFunnel(task, outcome) {
  if (task.type !== TASK_TYPES.CALL) return false;
  if (['email_only', 'material_requested', 'gatekeeper_email'].includes(outcome)) return true;
  return ['no_answer', 'voicemail', 'call_dropped'].includes(outcome) && ['3', 'FINAL'].includes(String(task.attempt_number || '').toUpperCase());
}

function createImmediateWhatsAppTask(leadId, title, fields = {}) {
  return createTask(db, {
    leadId,
    type: TASK_TYPES.WHATSAPP,
    title,
    dueAt: dateAtLocalTime(0, '11:30'),
    block: 'MESSAGES',
    priority: 'HIGH',
    channel: 'whatsapp',
    payload: {
      funnel: 'WHATSAPP_FOLLOW',
      source: fields.source || 'follow',
      messageTemplate: fields.messageTemplate || 'Olá, [Nome]. Conforme nosso contato, estou te chamando por aqui para facilitar. Faz sentido avançarmos com uma conversa rápida?'
    }
  });
}

function defaultPipeline() {
  return db.prepare('SELECT id FROM pipelines WHERE is_default = 1 ORDER BY id ASC LIMIT 1').get()
    || db.prepare('SELECT id FROM pipelines ORDER BY id ASC LIMIT 1').get()
    || { id: null };
}

function crmStage(stageKey, pipelineId = defaultPipeline().id) {
  if (!pipelineId) return null;
  return db.prepare('SELECT * FROM pipeline_stages WHERE pipeline_id = ? AND stage_key = ?').get(pipelineId, stageKey) || null;
}

function advanceAfterTask(task, outcome, fields) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(task.lead_id);

  if (task.type === TASK_TYPES.ENRICHMENT) {
    updateLeadEnrichment(task.lead_id, fields);
    if (outcome === 'approve') return createNextCadenceTask(db, lead, 0);
    if (outcome === 'research_again') return createEnrichmentTask(db, task.lead_id, 'Pesquisar novo contato ou telefone', addDaysIso(nowIso(), 1, '08:00'));
    if (outcome === 'no_fit') return loseLead(task.lead_id, fields.reason || 'Sem fit');
  }

  if ([TASK_TYPES.CALL, TASK_TYPES.WHATSAPP, TASK_TYPES.EMAIL, TASK_TYPES.LINKEDIN].includes(task.type)) {
    const step = Number(task.cadence_step || lead.current_cadence_step || 0);
    if (task.type === TASK_TYPES.EMAIL && task.payload?.funnel === 'EMAIL_FUNNEL') {
      if (['sent', 'no_response'].includes(outcome)) return advanceEmailFunnelTask(db, task, outcome, fields);
      if (['interested', 'meeting_scheduled'].includes(outcome)) return createMeeting(db, task.lead_id, fields);
      if (outcome === 'not_interested') {
        if (!fields.reason) {
          const error = new Error('Informe motivo obrigatório para perda ou nutrição.');
          error.status = 400;
          throw error;
        }
        return loseLead(task.lead_id, fields.reason, 'Sem interesse após e-mail');
      }
    }
    if (shouldMoveCallToEmailFunnel(task, outcome)) {
      return createEmailFunnelTask(db, task.lead_id, emailFunnelReason(outcome, fields, task), { id: task.id, outcome });
    }
    if (outcome === 'whatsapp_negotiation') {
      return createImmediateWhatsAppTask(task.lead_id, 'WhatsApp após ligação', { ...fields, source: 'call' });
    }
    if (['no_answer', 'voicemail', 'call_dropped', 'sent', 'no_response', 'linkedin_done'].includes(outcome)) {
      return createNextCadenceTask(db, lead, step);
    }
    if (outcome === 'phone_invalid') return createEnrichmentTask(db, task.lead_id, 'Pesquisar novo telefone', dateAtLocalTime(0, '08:00'));
    if (outcome === 'gatekeeper') {
      if (fields.followup_at) return createFollowUpTask(db, task.lead_id, fields.followup_at, 'Retorno com gatekeeper', fields);
      return createNextCadenceTask(db, lead, step);
    }
    if (outcome === 'callback_requested') {
      if (!fields.followup_at) {
        const error = new Error('Informe data/hora de retorno para pedido de retorno.');
        error.status = 400;
        throw error;
      }
      return createFollowUpTask(db, task.lead_id, fields.followup_at, 'Retorno prometido', fields);
    }
    if (['interested', 'meeting_scheduled'].includes(outcome)) return createMeeting(db, task.lead_id, fields);
    if (['not_interested', 'out_of_icp'].includes(outcome)) {
      if (!fields.reason) {
        const error = new Error('Informe motivo obrigatório para perda ou sem fit.');
        error.status = 400;
        throw error;
      }
      cancelOpenTasks(task.lead_id);
      return loseLead(task.lead_id, fields.reason, outcome === 'out_of_icp' ? 'Fora do ICP' : 'Sem interesse');
    }
  }

  if (task.type === TASK_TYPES.FOLLOW_UP) {
    if (outcome === 'meeting_scheduled') return createMeeting(db, task.lead_id, fields);
    if (outcome === 'callback_requested') {
      if (!fields.followup_at) {
        const error = new Error('Informe data/hora para o novo follow-up.');
        error.status = 400;
        throw error;
      }
      return createFollowUpTask(db, task.lead_id, fields.followup_at, 'Novo follow-up prometido', fields);
    }
    if (outcome === 'send_email') return createEmailFunnelTask(db, task.lead_id, fields.reason || 'Follow-up direcionado para e-mail', { id: task.id, outcome });
    if (outcome === 'send_whatsapp') return createImmediateWhatsAppTask(task.lead_id, 'WhatsApp de follow-up', { ...fields, source: 'follow_up' });
    if (outcome === 'resume_cadence') return createNextCadenceTask(db, lead, lead.current_cadence_step || 0);
    if (outcome === 'not_interested') {
      cancelOpenTasks(task.lead_id);
      return loseLead(task.lead_id, fields.reason || 'Sem interesse após follow-up');
    }
    if (outcome === 'no_answer') return createFollowUpTask(db, task.lead_id, addDaysIso(nowIso(), 1, '13:30'), 'Follow-up não conectado', fields);
    return createFollowUpTask(db, task.lead_id, addDaysIso(nowIso(), 1, '13:30'), 'Follow-up pendente', fields);
  }

  if (task.type === TASK_TYPES.MEETING_CONFIRMATION) {
    if (outcome === 'confirmed') {
      createTimeline(db, task.lead_id, 'MEETING_CONFIRMED', 'Reunião confirmada', fields);
      return null;
    }
    if (outcome === 'meeting_happened') {
      const pipeline = defaultPipeline();
      const stage = crmStage(OPPORTUNITY_STAGES.MEETING_DONE, pipeline.id);
      db.prepare('UPDATE opportunities SET pipeline_id = ?, stage_id = ?, stage = ?, probability = ?, updated_at = ? WHERE lead_id = ? AND stage != ?')
        .run(pipeline.id, stage?.id || null, OPPORTUNITY_STAGES.MEETING_DONE, stage?.probability || 60, nowIso(), task.lead_id, OPPORTUNITY_STAGES.CLOSED_WON);
      createTimeline(db, task.lead_id, 'GANHO_AGENDA_OCORRIDA', 'Reunião ocorreu', fields);
      return createCloserFollowUp(db, task.lead_id, 'Enviar proposta ou próximo passo do closer', dateAtLocalTime(0, '17:30'), fields);
    }
    if (outcome === 'no_show' || outcome === 'reschedule') return createFollowUpTask(db, task.lead_id, fields.followup_at || addDaysIso(nowIso(), 1, '13:30'), 'Remarcar reunião', fields);
  }

  if (task.type === TASK_TYPES.CLOSER_FOLLOW_UP) {
    const opportunity = db.prepare('SELECT * FROM opportunities WHERE lead_id = ? ORDER BY id DESC LIMIT 1').get(task.lead_id);
    if (outcome === 'proposal_sent') {
      const stage = crmStage(OPPORTUNITY_STAGES.PROPOSAL_SENT, opportunity?.pipeline_id || defaultPipeline().id);
      db.prepare('UPDATE opportunities SET stage_id = ?, stage = ?, value = ?, probability = ?, closer_follow_step = 1, expected_close_at = ?, updated_at = ? WHERE id = ?')
        .run(stage?.id || null, OPPORTUNITY_STAGES.PROPOSAL_SENT, Number(fields.value || opportunity?.value || 0), stage?.probability || 70, fields.expected_close_at || opportunity?.expected_close_at, nowIso(), opportunity.id);
      return createCloserFollowUp(db, task.lead_id, 'Follow-up de proposta 1/8', addDaysIso(nowIso(), 2, '10:00'), { closerStep: 1 });
    }
    if (outcome === 'follow_sent') {
      const nextStep = Math.min(Number(opportunity?.closer_follow_step || 0) + 1, 8);
      const stage = crmStage(OPPORTUNITY_STAGES.PROPOSAL_FOLLOW_UP, opportunity?.pipeline_id || defaultPipeline().id);
      db.prepare('UPDATE opportunities SET stage_id = ?, stage = ?, probability = ?, closer_follow_step = ?, updated_at = ? WHERE id = ?')
        .run(stage?.id || null, OPPORTUNITY_STAGES.PROPOSAL_FOLLOW_UP, stage?.probability || opportunity?.probability || 75, nextStep, nowIso(), opportunity.id);
      if (nextStep < 8) return createCloserFollowUp(db, task.lead_id, `Follow-up de proposta ${nextStep + 1}/8`, addDaysIso(nowIso(), 2, '10:00'), { closerStep: nextStep + 1 });
      createTimeline(db, task.lead_id, 'CLOSER_CYCLE_EXHAUSTED', '8 follow-ups realizados — definir resultado da proposta', { closerStep: nextStep, outcome });
      return createCloserFollowUp(db, task.lead_id, 'Decisão final: ganho ou perdido?', addDaysIso(nowIso(), 3, '10:00'), { closerStep: nextStep, terminal: true });
    }
    if (outcome === 'won') {
      const stage = crmStage(OPPORTUNITY_STAGES.CLOSED_WON, opportunity?.pipeline_id || defaultPipeline().id);
      db.prepare('UPDATE opportunities SET stage_id = ?, stage = ?, probability = 100, updated_at = ? WHERE id = ?').run(stage?.id || null, OPPORTUNITY_STAGES.CLOSED_WON, nowIso(), opportunity.id);
      createTimeline(db, task.lead_id, 'GANHO_PROPOSTA_CRM', 'Proposta marcada como ganha', fields);
      return null;
    }
    if (outcome === 'lost') {
      const stage = crmStage(OPPORTUNITY_STAGES.CLOSED_LOST, opportunity?.pipeline_id || defaultPipeline().id);
      db.prepare('UPDATE opportunities SET stage_id = ?, stage = ?, probability = 0, lost_reason = ?, updated_at = ? WHERE id = ?').run(stage?.id || null, OPPORTUNITY_STAGES.CLOSED_LOST, fields.reason || 'Não informado', nowIso(), opportunity.id);
      createTimeline(db, task.lead_id, 'PROPOSAL_LOST', 'Proposta perdida', fields);
    }
  }

  return null;
}

app.get('/api/auth/session', (req, res) => {
  const session = readSession(req);
  res.json({
    authenticated: Boolean(session),
    authEnabled: AUTH_ENABLED,
    user: session ? { username: session.username } : null,
    sessionHours: AUTH_SESSION_HOURS
  });
});

app.post('/api/auth/login', (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ ok: true, user: { username: AUTH_USER } });
  }
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!safeEqual(username, AUTH_USER) || !safeEqual(password, AUTH_PASSWORD)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  res.setHeader('Set-Cookie', sessionCookie(createSessionToken(username), req));
  return res.json({ ok: true, user: { username } });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie(req));
  res.json({ ok: true });
});

app.use('/api', requireAuth);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, now: nowIso() });
});

app.get('/api/bootstrap', (req, res) => {
  res.json({
    threeC: threeCConfig(),
    counts: {
      companies: db.prepare('SELECT COUNT(*) AS total FROM companies').get().total,
      leads: db.prepare('SELECT COUNT(*) AS total FROM leads').get().total,
      openTasks: db.prepare("SELECT COUNT(*) AS total FROM tasks WHERE status = 'OPEN'").get().total
    }
  });
});

app.get('/api/tasks/today', (req, res) => {
  res.json(taskSelect("WHERE t.status = 'OPEN' AND t.due_at <= ?", [endOfTodayIso()]));
});

app.get('/api/tasks/queue/:type', (req, res) => {
  const type = req.params.type.toUpperCase();
  res.json(taskSelect("WHERE t.status = 'OPEN' AND t.type = ?", [type]));
});

app.get('/api/tasks/:id', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  res.json({ task, lead: getLeadBundle(task.lead_id) });
});

app.patch('/api/tasks/:id/fields', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (task.status !== 'OPEN') return res.status(400).json({ error: 'Apenas tarefas abertas aceitam rascunho.' });

  const incoming = req.body?.fields && typeof req.body.fields === 'object' ? req.body.fields : {};
  const fields = { ...(task.fields || {}), ...incoming };

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE tasks SET fields_json = ?, updated_at = ? WHERE id = ?').run(stringifyJson(fields), nowIso(), task.id);
    if (task.type === TASK_TYPES.ENRICHMENT) updateLeadEnrichment(task.lead_id, fields);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  res.json({ ok: true, task: getTask(task.id), lead: getLeadBundle(task.lead_id) });
});

app.post('/api/tasks/:id/complete', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const { outcome, fields = {} } = req.body;
  if (!outcome) return res.status(400).json({ error: 'Outcome obrigatório' });
  db.exec('BEGIN');
  try {
    completeTask(db, task, outcome, fields);
    persistTaskContext(task, outcome, fields);
    updatePhoneValidation(task, outcome, fields);
    advanceAfterTask(task, outcome, fields);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  res.json({ ok: true, next: taskSelect("WHERE t.status = 'OPEN' AND t.lead_id = ?", [task.lead_id]) });
});

app.post('/api/tasks/:id/snooze', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const dueAt = req.body.due_at || addDaysIso(nowIso(), 1, '09:00');
  db.prepare("UPDATE tasks SET due_at = ?, status = 'OPEN', updated_at = ? WHERE id = ?").run(dueAt, nowIso(), task.id);
  createTimeline(db, task.lead_id, 'TASK_SNOOZED', 'Tarefa reagendada', { taskId: task.id, dueAt });
  res.json({ ok: true });
});

app.get('/api/leads', (req, res) => {
  const search = `%${String(req.query.q || '').trim()}%`;
  const rows = db.prepare(`
    SELECT l.*, c.legal_name, c.trade_name, c.cnpj, c.city,
      (SELECT COUNT(*) FROM tasks t WHERE t.lead_id = l.id AND t.status = 'OPEN') AS open_tasks
    FROM leads l
    JOIN companies c ON c.id = l.company_id
    WHERE (? = '%%' OR c.legal_name LIKE ? OR c.trade_name LIKE ? OR c.cnpj LIKE ?)
    ORDER BY l.updated_at DESC
    LIMIT 150
  `).all(search, search, search, search);
  res.json(rows);
});

app.get('/api/leads/:id', (req, res) => {
  const lead = getLeadBundle(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  res.json(lead);
});

app.get('/api/leads/:id/timeline', (req, res) => {
  res.json(db.prepare('SELECT * FROM timeline WHERE lead_id = ? ORDER BY created_at DESC, id DESC').all(req.params.id).map((row) => ({ ...row, details: parseJson(row.details_json) })));
});

app.post('/api/leads/:id/notes', (req, res) => {
  const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  const noteId = recordLeadNote(lead.id, req.body?.task_id || null, req.body?.body, req.body?.note_type || 'MANUAL');
  if (!noteId) return res.status(400).json({ error: 'Nota vazia' });
  createTimeline(db, lead.id, 'NOTE_ADDED', 'Nota adicionada ao lead', { noteId, body: req.body?.body });
  res.json(db.prepare('SELECT * FROM lead_notes WHERE id = ?').get(noteId));
});

app.post('/api/leads/:id/enrichment', (req, res) => {
  updateLeadEnrichment(req.params.id, req.body || {});
  createTimeline(db, req.params.id, 'ENRICHMENT_UPDATED', 'Enriquecimento atualizado', req.body || {});
  res.json(getLeadBundle(req.params.id));
});

app.get('/api/cadences', (req, res) => {
  res.json(db.prepare('SELECT * FROM cadences ORDER BY id ASC').all().map((row) => ({ ...row, steps: parseJson(row.steps_json, []) })));
});

app.put('/api/cadences/:id', (req, res) => {
  db.prepare('UPDATE cadences SET steps_json = ?, updated_at = ? WHERE id = ?').run(stringifyJson(req.body.steps || []), nowIso(), req.params.id);
  res.json({ ok: true });
});

app.get('/api/dashboard/bdr', (req, res) => {
  const todayStart = startOfTodayIso();
  const todayEnd = endOfTodayIso();
  const q = (sql, ...params) => db.prepare(sql).get(...params).total;
  res.json({
    leads: q('SELECT COUNT(*) AS total FROM leads'),
    openTasks: q("SELECT COUNT(*) AS total FROM tasks WHERE status = 'OPEN'"),
    overdue: q("SELECT COUNT(*) AS total FROM tasks WHERE status = 'OPEN' AND due_at < ?", todayStart),
    dueToday: q("SELECT COUNT(*) AS total FROM tasks WHERE status = 'OPEN' AND due_at <= ?", todayEnd),
    callsDoneToday: q("SELECT COUNT(*) AS total FROM tasks WHERE type = 'CALL' AND status = 'DONE' AND completed_at BETWEEN ? AND ?", todayStart, todayEnd),
    significantCallsToday: q("SELECT COUNT(*) AS total FROM tasks WHERE type = 'CALL' AND status = 'DONE' AND completed_at BETWEEN ? AND ? AND json_extract(fields_json, '$.call_significance') = 'SIGNIFICANT'", todayStart, todayEnd),
    nonSignificantCallsToday: q("SELECT COUNT(*) AS total FROM tasks WHERE type = 'CALL' AND status = 'DONE' AND completed_at BETWEEN ? AND ? AND json_extract(fields_json, '$.call_significance') = 'NON_SIGNIFICANT'", todayStart, todayEnd),
    meaningfulCalls: q("SELECT COUNT(*) AS total FROM tasks WHERE type = 'CALL' AND status = 'DONE' AND (outcome IN ('interested','meeting_scheduled','callback_requested','gatekeeper','gatekeeper_email','email_only','material_requested','whatsapp_negotiation') OR json_extract(fields_json, '$.call_significance') = 'SIGNIFICANT')"),
    meetings: q('SELECT COUNT(*) AS total FROM opportunities'),
    lost: q("SELECT COUNT(*) AS total FROM leads WHERE state = 'LOST'"),
    byType: db.prepare("SELECT type, COUNT(*) AS total FROM tasks WHERE status = 'OPEN' GROUP BY type").all(),
    outcomes: db.prepare("SELECT outcome, COUNT(*) AS total FROM tasks WHERE outcome IS NOT NULL GROUP BY outcome ORDER BY total DESC").all()
  });
});

app.get('/api/dashboard/funnels', (req, res) => {
  const openTasks = taskSelect("WHERE t.status = 'OPEN'");
  const buckets = [
    {
      id: 'ENRICHMENT',
      label: 'Enriquecimento',
      description: 'Leads ainda em validação de telefone, decisor e hipótese de dor.',
      tasks: []
    },
    {
      id: 'CALL_FUNNEL',
      label: 'Funil de ligação',
      description: 'Tentativas telefônicas e conversas que ainda dependem de conexão.',
      tasks: []
    },
    {
      id: 'EMAIL_FUNNEL',
      label: 'Funil de e-mail',
      description: 'Leads que saíram da ligação para e-mail por não conectar, gatekeeper ou pedido de material.',
      tasks: []
    },
    {
      id: 'MULTICHANNEL_CADENCE',
      label: 'Cadência multicanal',
      description: 'WhatsApp, e-mail de cadência e LinkedIn ainda dentro da sequência fria.',
      tasks: []
    },
    {
      id: 'FOLLOW_UP',
      label: 'Retornos',
      description: 'Promessas de retorno, gatekeepers com data e follow-ups comerciais.',
      tasks: []
    },
    {
      id: 'MEETING_CRM',
      label: 'Reunião/CRM',
      description: 'Confirmações de reunião e follow-ups de closer.',
      tasks: []
    }
  ];
  const byId = Object.fromEntries(buckets.map((bucket) => [bucket.id, bucket]));
  openTasks.forEach((task) => {
    let bucket = 'MULTICHANNEL_CADENCE';
    if (task.type === TASK_TYPES.ENRICHMENT) bucket = 'ENRICHMENT';
    if (task.type === TASK_TYPES.CALL) bucket = 'CALL_FUNNEL';
    if (task.type === TASK_TYPES.EMAIL && task.payload?.funnel === 'EMAIL_FUNNEL') bucket = 'EMAIL_FUNNEL';
    if (task.type === TASK_TYPES.FOLLOW_UP) bucket = 'FOLLOW_UP';
    if ([TASK_TYPES.MEETING_CONFIRMATION, TASK_TYPES.CLOSER_FOLLOW_UP].includes(task.type)) bucket = 'MEETING_CRM';
    byId[bucket].tasks.push(task);
  });
  const transitions = db.prepare(`
    SELECT event_type, COUNT(*) AS total
    FROM timeline
    WHERE event_type IN ('EMAIL_FUNNEL_ENTERED', 'EMAIL_FUNNEL_NEXT', 'EMAIL_FUNNEL_FINISHED', 'MEETING_SCHEDULED', 'LEAD_LOST')
    GROUP BY event_type
  `).all();
  res.json({
    buckets: buckets.map((bucket) => ({
      ...bucket,
      count: bucket.tasks.length,
      tasks: bucket.tasks.slice(0, 12)
    })),
    transitions
  });
});

app.get('/api/dashboard/closer', (req, res) => {
  res.json({
    openOpportunities: db.prepare("SELECT COUNT(*) AS total FROM opportunities WHERE stage NOT IN ('CLOSED_WON','CLOSED_LOST')").get().total,
    proposalValue: db.prepare("SELECT COALESCE(SUM(value), 0) AS total FROM opportunities WHERE stage NOT IN ('CLOSED_WON','CLOSED_LOST')").get().total,
    won: db.prepare("SELECT COUNT(*) AS total FROM opportunities WHERE stage = 'CLOSED_WON'").get().total,
    lost: db.prepare("SELECT COUNT(*) AS total FROM opportunities WHERE stage = 'CLOSED_LOST'").get().total,
    byStage: db.prepare('SELECT stage, COUNT(*) AS total, COALESCE(SUM(value), 0) AS value FROM opportunities GROUP BY stage').all()
  });
});

function slugify(value) {
  return String(value || 'pipeline')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'pipeline';
}

function pipelinesWithStages() {
  const pipelines = db.prepare('SELECT * FROM pipelines ORDER BY is_default DESC, id ASC').all();
  return pipelines.map((pipeline) => ({
    ...pipeline,
    stages: db.prepare('SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY position ASC, id ASC').all(pipeline.id)
  }));
}

app.get('/api/crm/pipelines', (req, res) => {
  res.json(pipelinesWithStages());
});

app.post('/api/crm/pipelines', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome do pipeline obrigatório' });
  let slug = slugify(name);
  const exists = db.prepare('SELECT id FROM pipelines WHERE slug = ?').get(slug);
  if (exists) slug = `${slug}-${Date.now()}`;
  const result = db.prepare(`
    INSERT INTO pipelines (slug, name, is_default, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
  `).run(slug, name, nowIso(), nowIso());
  const defaults = req.body?.stages?.length ? req.body.stages : [
    { name: 'Entrada', probability: 20 },
    { name: 'Proposta', probability: 60 },
    { name: 'Negociação', probability: 80 },
    { name: 'Ganho', probability: 100, is_won: 1 },
    { name: 'Perdido', probability: 0, is_lost: 1 }
  ];
  defaults.forEach((stage, index) => {
    db.prepare(`
      INSERT INTO pipeline_stages (pipeline_id, stage_key, name, position, probability, is_won, is_lost, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(result.lastInsertRowid, `${slugify(stage.name)}-${index + 1}`, stage.name, index + 1, Number(stage.probability || 20), stage.is_won || 0, stage.is_lost || 0, nowIso(), nowIso());
  });
  res.json(pipelinesWithStages().find((pipeline) => pipeline.id === result.lastInsertRowid));
});

app.post('/api/crm/pipelines/:id/stages', (req, res) => {
  const pipeline = db.prepare('SELECT * FROM pipelines WHERE id = ?').get(req.params.id);
  if (!pipeline) return res.status(404).json({ error: 'Pipeline não encontrado' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome da etapa obrigatório' });
  const maxPosition = db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM pipeline_stages WHERE pipeline_id = ?').get(pipeline.id).max;
  const result = db.prepare(`
    INSERT INTO pipeline_stages (pipeline_id, stage_key, name, position, probability, is_won, is_lost, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pipeline.id,
    `${slugify(name)}-${Date.now()}`,
    name,
    maxPosition + 1,
    Number(req.body?.probability || 20),
    req.body?.is_won ? 1 : 0,
    req.body?.is_lost ? 1 : 0,
    nowIso(),
    nowIso()
  );
  res.json(db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(result.lastInsertRowid));
});

app.get('/api/crm/opportunities', (req, res) => {
  res.json(db.prepare(`
    SELECT o.*, l.state AS lead_state, c.legal_name, c.trade_name, c.cnpj, c.city,
      pl.name AS pipeline_name,
      ps.name AS stage_name,
      ps.position AS stage_position,
      ps.is_won,
      ps.is_lost,
      ct.name AS contact_name,
      p.phone AS primary_phone
    FROM opportunities o
    JOIN leads l ON l.id = o.lead_id
    JOIN companies c ON c.id = l.company_id
    LEFT JOIN pipelines pl ON pl.id = o.pipeline_id
    LEFT JOIN pipeline_stages ps ON ps.id = o.stage_id
    LEFT JOIN contacts ct ON ct.company_id = c.id AND ct.is_primary = 1
    LEFT JOIN phones p ON p.id = (
      SELECT id FROM phones WHERE company_id = c.id ORDER BY do_not_call ASC, CASE WHEN is_valid = 0 THEN 1 ELSE 0 END, priority ASC, id ASC LIMIT 1
    )
    ORDER BY o.updated_at DESC
  `).all());
});

app.patch('/api/crm/opportunities/:id', (req, res) => {
  const opportunity = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opportunity) return res.status(404).json({ error: 'Oportunidade não encontrada' });
  const stage = req.body?.stage_id ? db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(req.body.stage_id) : null;
  const pipelineId = req.body?.pipeline_id || stage?.pipeline_id || opportunity.pipeline_id;
  const stageId = stage?.id || opportunity.stage_id;
  const stageKey = stage?.stage_key || opportunity.stage;
  const probability = req.body?.probability != null ? Number(req.body.probability) : (stage?.probability ?? opportunity.probability);
  db.prepare(`
    UPDATE opportunities
       SET pipeline_id = ?, stage_id = ?, stage = ?, title = COALESCE(?, title), value = COALESCE(?, value),
           probability = ?, expected_close_at = COALESCE(?, expected_close_at), lost_reason = COALESCE(?, lost_reason), updated_at = ?
     WHERE id = ?
  `).run(
    pipelineId,
    stageId,
    stageKey,
    req.body?.title || null,
    req.body?.value != null && req.body.value !== '' ? Number(req.body.value) : null,
    probability,
    req.body?.expected_close_at || null,
    req.body?.lost_reason || null,
    nowIso(),
    opportunity.id
  );
  createTimeline(db, opportunity.lead_id, 'OPPORTUNITY_UPDATED', 'Oportunidade atualizada', { opportunityId: opportunity.id, stageId, stageKey, pipelineId });
  res.json(db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opportunity.id));
});

app.get('/api/settings/3c', (req, res) => {
  res.json(threeCConfig());
});

app.post('/api/3c/manual-call/start', asyncRoute(async (req, res) => {
  const { taskId, leadId, phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefone obrigatório' });
  const result = await startManualCall({ phone });
  const callId = result?.id || result?.call_id || result?.callId || null;
  db.prepare(`
    INSERT INTO calls (lead_id, call_id, phone, status, payload_json, started_at, updated_at)
    VALUES (?, ?, ?, 'started', ?, ?, ?)
  `).run(leadId || null, callId, String(phone), stringifyJson(result), nowIso(), nowIso());
  if (leadId) createTimeline(db, leadId, 'CALL_STARTED', 'Ligação iniciada na 3C+', { phone, taskId, callId });
  res.json({ ok: true, callId, result });
}));

app.post('/api/3c/manual-call/:callId/qualify', asyncRoute(async (req, res) => {
  const qualificationId = req.body.qualification_id || qualificationIdFor(req.body.outcome);
  if (!qualificationId) return res.status(400).json({ error: 'qualification_id não configurado para este outcome' });
  const result = await qualifyManualCall({ callId: req.params.callId, qualificationId, note: req.body.note });
  res.json({ ok: true, result });
}));

app.get('/api/3c/calls/recent', asyncRoute(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const result = await threeCApiGet('/calls', { limit, with_mailing: 'true' }, req.query.token === 'operator' ? 'operator' : 'admin');
  res.json(result);
}));

app.get('/api/calls/:id/recording', requireAuth, asyncRoute(async (req, res) => {
  const call = db.prepare('SELECT call_id FROM calls WHERE id = ?').get(req.params.id);
  if (!call?.call_id) return res.status(404).json({ error: 'Ligação não encontrada' });
  if (!/^[a-f0-9]{24}$/.test(call.call_id)) return res.status(404).json({ error: 'Sem gravação para esta ligação' });
  const base = (process.env.THREEC_BASE_URL || 'https://cloudesignmarketing.3c.plus/api/v1').replace(/\/$/, '');
  const url = `${base}/calls/${call.call_id}/recording?api_token=${process.env.THREEC_ADMIN_TOKEN}`;
  const r = await fetch(url);
  if (!r.ok) return res.status(r.status).json({ error: 'Gravação indisponível na 3C+' });
  const buffer = await r.arrayBuffer();
  res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
  res.send(Buffer.from(buffer));
}));

app.get('/api/integrations/3c/webhook', (req, res) => {
  res.json({
    ok: true,
    receiver: '/api/integrations/3c/webhook',
    publicReceiver: process.env.THREEC_WEBHOOK_PUBLIC_URL || 'https://sales.yvex.online/api_3c_receiver.php',
    acceptedEvents: ['call-was-connected', 'call-history-was-created']
  });
});

app.get('/api/integrations/3c/summary', (req, res) => {
  const todayStart = startOfTodayIso();
  const todayEnd = endOfTodayIso();
  const totals = Object.fromEntries(db.prepare(`
    SELECT COALESCE(classification, 'unknown') AS classification, COUNT(*) AS total
    FROM integration_events
    WHERE source = '3c' AND created_at BETWEEN ? AND ?
    GROUP BY COALESCE(classification, 'unknown')
  `).all(todayStart, todayEnd).map((row) => [row.classification, row.total]));
  res.json({
    today: {
      total: db.prepare("SELECT COUNT(*) AS total FROM integration_events WHERE source = '3c' AND created_at BETWEEN ? AND ?").get(todayStart, todayEnd).total,
      follow: totals.follow || 0,
      meeting: totals.meeting || 0,
      noAnswer: (totals.no_answer || 0) + (totals.voicemail || 0),
      invalid: totals.phone_invalid || 0,
      noLink: totals.phone_no_link || 0,
      notInterested: totals.not_interested || 0,
      outOfIcp: totals.out_of_icp || 0,
      gatekeeper: totals.gatekeeper || 0,
      unknown: totals.unknown || 0
    },
    byClassification: totals
  });
});

app.get('/api/integrations/3c/recent', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 150);
  const rows = db.prepare(`
    SELECT
      ie.id,
      ie.event_type,
      ie.status,
      ie.phone,
      ie.classification,
      ie.qualification,
      ie.call_id,
      ie.sid,
      ie.error,
      ie.created_at,
      ie.processed_at,
      ie.lead_id,
      c.trade_name,
      c.legal_name,
      c.cnpj,
      c.city,
      t.id AS open_task_id,
      t.type AS open_task_type,
      t.title AS open_task_title
    FROM integration_events ie
    LEFT JOIN leads l ON l.id = ie.lead_id
    LEFT JOIN companies c ON c.id = l.company_id
    LEFT JOIN tasks t ON t.id = (
      SELECT id FROM tasks WHERE lead_id = l.id AND status = 'OPEN' ORDER BY due_at ASC, id ASC LIMIT 1
    )
    WHERE ie.source = '3c'
    ORDER BY ie.created_at DESC, ie.id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

app.post('/api/integrations/3c/webhook', (req, res) => {
  const result = processThreeCWebhook(req.body || {});
  res.json(result);
});

async function syncFromThreeCApi() {
  const lastRow = db.prepare("SELECT value FROM settings WHERE key = 'threec_last_sync'").get();
  const windowStart = lastRow?.value
    ? new Date(new Date(lastRow.value).getTime() - 10 * 60 * 1000)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date();
  // 3C+ API uses local time (GMT-3) — subtract 3 hours from UTC
  const toLocalFmt = (d) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const fmt = toLocalFmt;

  let result;
  try {
    result = await fetchThreeCCalls(fmt(windowStart), fmt(windowEnd), 500);
  } catch (err) {
    throw new Error(`Erro ao buscar ligações na 3C+: ${err.message}`);
  }

  const calls = result?.data || [];
  const stats = { processed: 0, skipped: 0, duplicate: 0, errors: 0, total: calls.length };

  for (const call of calls) {
    const qualId = String(call.qualification_id || '');
    if (!THREEC_QUALIFICATION_MAP[qualId]) { stats.skipped++; continue; }

    const mailingData = call.mailing_data?.data || {};
    const payload = {
      'call-history-was-created': {
        callHistory: {
          _id: call.id,
          sid: call.sid || call.id,
          number: call.number,
          qualification: { name: call.qualification || THREEC_QUALIFICATION_MAP[qualId].label },
          qualification_id: call.qualification_id,
          qualification_note: [call.qualification_note, call.feedback].filter(Boolean).join(' | ') || THREEC_QUALIFICATION_MAP[qualId].label,
          status: call.readable_status_text || '',
          mailing_data: { data: { ...mailingData, Identificador: mailingData.CNPJ || '' } },
          recording: call.recording || null,
          speaking_with_agent_time: 10
        }
      }
    };

    try {
      const r = processThreeCWebhook(payload);
      if (r.duplicate) stats.duplicate++; else stats.processed++;
    } catch (err) {
      stats.errors++;
      console.error(`[3c-sync] erro call ${call.id}:`, err.message);
    }
  }

  setSetting('threec_last_sync', windowEnd.toISOString());
  return { ...stats, from: fmt(windowStart), to: fmt(windowEnd) };
}

app.post('/api/integrations/3c/sync', asyncRoute(async (req, res) => {
  const result = await syncFromThreeCApi();
  res.json({ ok: true, ...result });
}));

app.get('/api/integrations/3c/sync/status', (req, res) => {
  const lastSync = db.prepare("SELECT value FROM settings WHERE key = 'threec_last_sync'").get();
  res.json({ lastSync: lastSync?.value || null });
});

// Auto-sync a cada 5 minutos
setInterval(() => {
  syncFromThreeCApi().catch((err) => console.error('[3c-sync]', err.message));
}, 5 * 60 * 1000);

app.post('/api/import/csv', asyncRoute(async (req, res) => {
  const dir = process.env.CSV_IMPORT_DIR;
  if (!dir) return res.status(400).json({ error: 'CSV_IMPORT_DIR não configurado no .env' });
  const result = importCsvDirectory(dir);
  res.json({ ok: true, ...result });
}));

// Serve frontend estático (produção)
const distPath = resolve(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get('/{*path}', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  createReadStream(join(distPath, 'index.html')).pipe(res);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno', details: err.details });
});

app.listen(PORT, () => {
  console.log(`Cloud Sales Engagement BDR API on http://localhost:${PORT}`);
});
