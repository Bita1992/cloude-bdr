import { config } from 'dotenv';
import { stringifyJson } from './json.js';
import { nowIso } from './time.js';

export const THREEC_QUALIFICATION_MAP = {
  '216326': { classification: 'meeting',        outcome: 'meeting_scheduled',    label: 'Agendou diagnóstico' },
  '216325': { classification: 'follow',         outcome: 'callback_requested',   label: 'Levantou a mão' },
  '216342': { classification: 'whatsapp',       outcome: 'whatsapp_negotiation', label: 'Pediu WhatsApp/material' },
  '216343': { classification: 'follow',         outcome: 'callback_requested',   label: 'Influenciador passou contato' },
  '216324': { classification: 'connected',      outcome: 'no_answer',            label: 'Decisor localizado' },
  '216346': { classification: 'phone_no_link',   outcome: 'phone_invalid',        label: 'Não é decisor' },
  '216348': { classification: 'no_answer',      outcome: 'no_answer',            label: 'Discar denovo' },
  '216344': { classification: 'not_interested', outcome: 'not_interested',       label: 'Sem interesse agora' },
  '216345': { classification: 'out_of_icp',    outcome: 'out_of_icp',           label: 'Sem fit / fora do ICP' },
  '216347': { classification: 'not_interested', outcome: 'not_interested',       label: 'Não ligar mais', doNotCall: true },
  '-3':     { classification: 'voicemail',      outcome: 'voicemail',            label: 'Caixa Postal' },
  '-4':     { classification: 'no_answer',      outcome: 'no_answer',            label: 'Mudo' },
  '-5':     { classification: 'no_answer',      outcome: 'no_answer',            label: 'Limite de tempo excedido' },
};

// IDs customizados do mapa (exclui os do sistema: -2, -3, -4, -5)
export const CUSTOM_QUALIFICATION_IDS = Object.keys(THREEC_QUALIFICATION_MAP)
  .filter((id) => !id.startsWith('-'));

export async function fetchThreeCCalls(startDate, endDate, limit = 300) {
  // Monta query string manualmente para suportar parâmetros array (qualifications[])
  const base = (process.env.THREEC_BASE_URL || 'https://cloudesignmarketing.3c.plus/api/v1').replace(/\/$/, '');
  const token = process.env.THREEC_ADMIN_TOKEN || process.env.THREEC_OPERATOR_TOKEN;
  const params = new URLSearchParams({
    api_token: token,
    start_date: startDate,
    end_date: endDate,
    limit: String(limit),
    with_mailing: 'true'
  });
  // Adiciona cada qualification_id como qualifications[]
  for (const id of CUSTOM_QUALIFICATION_IDS) {
    params.append('qualifications[]', id);
  }
  const response = await fetch(`${base}/calls?${params}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

config();

const DEFAULT_BASE_URL = 'https://sua-conta.3c.plus/api/v1';

export function threeCConfig() {
  return {
    baseUrl: process.env.THREEC_BASE_URL || DEFAULT_BASE_URL,
    hasAdminToken: Boolean(process.env.THREEC_ADMIN_TOKEN),
    hasOperatorToken: Boolean(process.env.THREEC_OPERATOR_TOKEN),
    webhookPublicUrl: process.env.THREEC_WEBHOOK_PUBLIC_URL || '',
    campaignId: process.env.THREEC_CAMPAIGN_ID || '',
    extension: process.env.THREEC_EXTENSION || ''
  };
}

function operatorToken() {
  const token = process.env.THREEC_OPERATOR_TOKEN;
  if (!token) {
    const error = new Error('THREEC_OPERATOR_TOKEN não configurado no .env');
    error.status = 400;
    throw error;
  }
  return token;
}

function adminToken() {
  return process.env.THREEC_ADMIN_TOKEN || operatorToken();
}

function apiUrl(path, token = operatorToken(), params = {}) {
  const base = (process.env.THREEC_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = new URL(`${base}${path}`);
  url.searchParams.set('api_token', token);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url;
}

export async function threeCApiGet(path, params = {}, tokenType = 'admin') {
  const token = tokenType === 'operator' ? operatorToken() : adminToken();
  const response = await fetch(apiUrl(path, token, params));
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!response.ok) {
    const error = new Error(json?.detail || json?.title || `3C+ retornou ${response.status}`);
    error.status = response.status;
    error.details = json || text;
    throw error;
  }
  return json ?? { status: response.status };
}

async function formPost(path, fields = {}, token) {
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
  });
  const response = await fetch(apiUrl(path, token), { method: 'POST', body });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!response.ok) {
    const error = new Error(json?.detail || json?.title || `3C+ retornou ${response.status}`);
    error.status = response.status;
    error.details = json || text;
    throw error;
  }
  return json ?? { status: response.status };
}

export async function startManualCall({ phone, scheduleId }) {
  const campaign = process.env.THREEC_CAMPAIGN_ID;
  if (campaign) {
    await formPost('/agent/login', { campaign, mode: 'manual' });
  }
  await formPost('/agent/manual_call/enter');
  return formPost('/agent/manual_call/dial', {
    phone,
    shedule_id: scheduleId
  });
}

export async function qualifyManualCall({ callId, qualificationId, note }) {
  return formPost(`/agent/manual_call/${encodeURIComponent(callId)}/qualify`, {
    qualification_id: qualificationId,
    qualification_note: note
  });
}

export function qualificationIdFor(outcome) {
  const map = {
    no_answer: 'THREEC_QUALIFICATION_NO_ANSWER',
    voicemail: 'THREEC_QUALIFICATION_VOICEMAIL',
    gatekeeper: 'THREEC_QUALIFICATION_GATEKEEPER',
    callback_requested: 'THREEC_QUALIFICATION_CALLBACK',
    meeting_scheduled: 'THREEC_QUALIFICATION_MEETING',
    not_interested: 'THREEC_QUALIFICATION_NOT_INTERESTED'
  };
  return process.env[map[outcome] || ''] || '';
}

export function persistIntegrationEvent(db, {
  source = '3c',
  eventKey,
  eventType,
  leadId = null,
  callId = null,
  sid = null,
  phone = null,
  classification = null,
  qualification = null,
  payload = {},
  status = 'processed',
  error = null
}) {
  db.prepare(`
    INSERT INTO integration_events (source, event_key, event_type, lead_id, call_id, sid, phone, classification, qualification, payload_json, status, processed_at, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) DO UPDATE SET
      lead_id = COALESCE(excluded.lead_id, integration_events.lead_id),
      call_id = COALESCE(excluded.call_id, integration_events.call_id),
      sid = COALESCE(excluded.sid, integration_events.sid),
      phone = COALESCE(excluded.phone, integration_events.phone),
      classification = COALESCE(excluded.classification, integration_events.classification),
      qualification = COALESCE(excluded.qualification, integration_events.qualification),
      payload_json = excluded.payload_json,
      status = excluded.status,
      processed_at = excluded.processed_at,
      error = excluded.error
  `).run(
    source,
    eventKey,
    eventType,
    leadId,
    callId,
    sid,
    phone,
    classification,
    qualification,
    stringifyJson(payload),
    status,
    nowIso(),
    error,
    nowIso()
  );
  return db.prepare('SELECT id FROM integration_events WHERE event_key = ?').get(eventKey);
}
