import assert from 'node:assert/strict';
import { resetDb, db } from '../lib/db.js';
import { importWorkbook } from '../lib/importer.js';
import { advanceEmailFunnelTask, completeTask, createEmailFunnelTask, createMeeting, createNextCadenceTask, TASK_TYPES } from '../lib/cadence.js';

function first(sql, ...params) {
  return db.prepare(sql).get(...params);
}

resetDb();
const imported = await importWorkbook({ resetExisting: true });

assert.equal(imported.leads, 409, 'deve importar 409 leads por CNPJ unico');
assert.equal(imported.companies, 409, 'deve criar 409 empresas');
assert.equal(imported.leadsWithPhone, 407, 'deve detectar 407 leads com telefone');
assert.equal(imported.leadsWithoutPhone, 2, 'deve detectar 2 leads sem telefone');
assert.equal(imported.enrichmentTasks, 409, 'deve criar enriquecimento para todos os leads');
assert.ok(first('SELECT raw_json FROM companies WHERE raw_json != ? LIMIT 1', '{}'), 'deve persistir dados brutos da planilha');
assert.ok(first('SELECT id FROM pipelines WHERE is_default = 1 LIMIT 1'), 'deve criar pipeline closer padrao');
assert.ok(first('SELECT id FROM pipeline_stages LIMIT 1'), 'deve criar etapas do pipeline');

const enrichment = first("SELECT * FROM tasks WHERE type = 'ENRICHMENT' AND status = 'OPEN' ORDER BY id ASC LIMIT 1");
assert.ok(enrichment, 'deve existir tarefa de enriquecimento aberta');

completeTask(db, enrichment, 'approve', {
  phone_found: '11999999999',
  phone_source: 'Teste automatizado',
  decision_maker: 'Decisor Teste',
  pain_hypothesis: 'Teste de dor'
});
let lead = first('SELECT * FROM leads WHERE id = ?', enrichment.lead_id);
createNextCadenceTask(db, lead, 0);

const call = first("SELECT * FROM tasks WHERE lead_id = ? AND type = 'CALL' AND status = 'OPEN' ORDER BY id DESC LIMIT 1", enrichment.lead_id);
assert.equal(call.cadence_step, 1, 'aprovacao deve criar ligacao 1');
assert.equal(call.attempt_number, '1', 'tentativa deve vir do motor de cadencia');

completeTask(db, call, 'no_answer', {});
lead = first('SELECT * FROM leads WHERE id = ?', enrichment.lead_id);
createNextCadenceTask(db, lead, call.cadence_step);

const whatsapp = first("SELECT * FROM tasks WHERE lead_id = ? AND type = ? AND status = 'OPEN' ORDER BY id DESC LIMIT 1", enrichment.lead_id, TASK_TYPES.WHATSAPP);
assert.equal(whatsapp.cadence_step, 2, 'nao atendeu deve criar WhatsApp 1');

const emailFunnelId = createEmailFunnelTask(db, enrichment.lead_id, 'Teste de passagem ligacao para email', { id: call.id, outcome: 'no_answer' });
const emailFunnel = first('SELECT * FROM tasks WHERE id = ?', emailFunnelId);
const emailPayload = JSON.parse(emailFunnel.payload_json);
assert.equal(emailFunnel.type, TASK_TYPES.EMAIL, 'passagem deve criar tarefa de email');
assert.equal(emailPayload.funnel, 'EMAIL_FUNNEL', 'email deve carregar marcador do funil de email');
assert.equal(emailPayload.emailFunnelStep, 1, 'primeiro email deve ser etapa 1');

completeTask(db, emailFunnel, 'sent', {});
advanceEmailFunnelTask(db, emailFunnel, 'sent', {});
const emailFunnelNext = first("SELECT * FROM tasks WHERE lead_id = ? AND type = ? AND status = 'OPEN' AND block = 'EMAIL_FUNNEL' ORDER BY id DESC LIMIT 1", enrichment.lead_id, TASK_TYPES.EMAIL);
assert.equal(JSON.parse(emailFunnelNext.payload_json).emailFunnelStep, 2, 'envio do email 1 deve criar email 2');

createMeeting(db, enrichment.lead_id, { meeting_at: new Date().toISOString(), opportunity_title: 'Teste closer' });
const opportunity = first('SELECT * FROM opportunities WHERE lead_id = ? ORDER BY id DESC LIMIT 1', enrichment.lead_id);
assert.ok(opportunity.pipeline_id, 'reuniao deve criar oportunidade com pipeline');
assert.ok(opportunity.stage_id, 'reuniao deve criar oportunidade com etapa configuravel');

console.log(JSON.stringify({
  ok: true,
  imported,
  cadenceSmoke: {
    enrichmentTaskId: enrichment.id,
    firstCallTaskId: call.id,
    nextTaskId: whatsapp.id,
    emailFunnelTaskId: emailFunnelId,
    emailFunnelNextTaskId: emailFunnelNext.id
  }
}, null, 2));
