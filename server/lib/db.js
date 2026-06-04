import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from 'dotenv';
import { nowIso } from './time.js';
import { OPPORTUNITY_STAGES, seedCadence } from './cadence.js';

config();

const dbPath = process.env.DATABASE_PATH || 'data/app.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

const DEFAULT_PIPELINE_STAGES = [
  { key: OPPORTUNITY_STAGES.MEETING_SCHEDULED, name: 'Reunião agendada', position: 1, probability: 35 },
  { key: OPPORTUNITY_STAGES.MEETING_DONE, name: 'Reunião ocorrida', position: 2, probability: 60 },
  { key: OPPORTUNITY_STAGES.DIAGNOSIS_DONE, name: 'Diagnóstico', position: 3, probability: 65 },
  { key: OPPORTUNITY_STAGES.PROPOSAL_SENT, name: 'Proposta enviada', position: 4, probability: 70 },
  { key: OPPORTUNITY_STAGES.PROPOSAL_FOLLOW_UP, name: 'Follow-up proposta', position: 5, probability: 75 },
  { key: OPPORTUNITY_STAGES.NEGOTIATION, name: 'Negociação', position: 6, probability: 85 },
  { key: OPPORTUNITY_STAGES.CLOSED_WON, name: 'Ganho', position: 7, probability: 100, isWon: 1 },
  { key: OPPORTUNITY_STAGES.CLOSED_LOST, name: 'Perdido', position: 8, probability: 0, isLost: 1 }
];

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function ensureColumn(table, column, definition) {
  if (!columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

export function seedDefaultPipeline(database = db) {
  let pipeline = database.prepare('SELECT id FROM pipelines WHERE slug = ?').get('closer-default');
  if (!pipeline) {
    const result = database.prepare(`
      INSERT INTO pipelines (slug, name, is_default, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
    `).run('closer-default', 'Closer padrão', nowIso(), nowIso());
    pipeline = { id: result.lastInsertRowid };
  }

  DEFAULT_PIPELINE_STAGES.forEach((stage) => {
    database.prepare(`
      INSERT INTO pipeline_stages (pipeline_id, stage_key, name, position, probability, is_won, is_lost, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pipeline_id, stage_key) DO UPDATE SET
        name = excluded.name,
        position = excluded.position,
        probability = excluded.probability,
        is_won = excluded.is_won,
        is_lost = excluded.is_lost,
        updated_at = excluded.updated_at
    `).run(
      pipeline.id,
      stage.key,
      stage.name,
      stage.position,
      stage.probability,
      stage.isWon || 0,
      stage.isLost || 0,
      nowIso(),
      nowIso()
    );
  });

  database.prepare(`
    UPDATE opportunities
       SET pipeline_id = COALESCE(pipeline_id, ?),
           stage_id = COALESCE(stage_id, (
             SELECT id FROM pipeline_stages WHERE pipeline_id = ? AND stage_key = opportunities.stage
           ))
     WHERE pipeline_id IS NULL OR stage_id IS NULL
  `).run(pipeline.id, pipeline.id);

  return pipeline.id;
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cnpj TEXT NOT NULL UNIQUE,
      legal_name TEXT NOT NULL,
      trade_name TEXT,
      opened_at TEXT,
      cnae TEXT,
      city TEXT,
      raw_json TEXT NOT NULL DEFAULT '{}',
      source_row INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      cpf TEXT,
      name TEXT NOT NULL,
      role TEXT,
      linkedin TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, name)
    );

    CREATE TABLE IF NOT EXISTS phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      phone TEXT NOT NULL,
      source TEXT,
      is_valid INTEGER,
      status TEXT NOT NULL DEFAULT 'UNVALIDATED',
      relationship TEXT NOT NULL DEFAULT 'UNKNOWN',
      owner_name TEXT,
      do_not_call INTEGER NOT NULL DEFAULT 0,
      validation_note TEXT,
      last_validated_at TEXT,
      validated_by_task_id INTEGER,
      priority INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, phone)
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
      owner TEXT NOT NULL DEFAULT 'BDR',
      state TEXT NOT NULL DEFAULT 'NEW',
      current_cadence_step INTEGER NOT NULL DEFAULT 0,
      cadence_started_at TEXT,
      enrichment_json TEXT NOT NULL DEFAULT '{}',
      lost_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cadences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      stage_key TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 100,
      probability INTEGER NOT NULL DEFAULT 20,
      is_won INTEGER NOT NULL DEFAULT 0,
      is_lost INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(pipeline_id, stage_key)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      title TEXT NOT NULL,
      due_at TEXT NOT NULL,
      block TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'MEDIUM',
      cadence_step INTEGER,
      channel TEXT,
      attempt_number TEXT,
      outcome TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      fields_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);

    CREATE TABLE IF NOT EXISTS timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_lead_created ON timeline(lead_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      pipeline_id INTEGER REFERENCES pipelines(id) ON DELETE SET NULL,
      stage_id INTEGER REFERENCES pipeline_stages(id) ON DELETE SET NULL,
      title TEXT,
      stage TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      probability INTEGER NOT NULL DEFAULT 20,
      expected_close_at TEXT,
      lost_reason TEXT,
      closer_follow_step INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
    CREATE INDEX IF NOT EXISTS idx_opportunities_pipeline ON opportunities(pipeline_id, stage_id);

    CREATE TABLE IF NOT EXISTS lead_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      note_type TEXT NOT NULL DEFAULT 'NOTE',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_created ON lead_notes(lead_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS integration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      call_id TEXT,
      sid TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'processed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      call_id TEXT UNIQUE,
      sid TEXT,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'started',
      recording_url TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureColumn('companies', 'raw_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('phones', 'status', "TEXT NOT NULL DEFAULT 'UNVALIDATED'");
  ensureColumn('phones', 'relationship', "TEXT NOT NULL DEFAULT 'UNKNOWN'");
  ensureColumn('phones', 'owner_name', 'TEXT');
  ensureColumn('phones', 'do_not_call', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('phones', 'validation_note', 'TEXT');
  ensureColumn('phones', 'last_validated_at', 'TEXT');
  ensureColumn('phones', 'validated_by_task_id', 'INTEGER');
  ensureColumn('integration_events', 'phone', 'TEXT');
  ensureColumn('integration_events', 'classification', 'TEXT');
  ensureColumn('integration_events', 'qualification', 'TEXT');
  ensureColumn('integration_events', 'processed_at', 'TEXT');
  ensureColumn('integration_events', 'error', 'TEXT');
  ensureColumn('calls', 'task_id', 'INTEGER');
  ensureColumn('calls', 'classification', 'TEXT');
  ensureColumn('calls', 'qualification', 'TEXT');
  ensureColumn('calls', 'qualification_id', 'TEXT');
  ensureColumn('calls', 'duration_seconds', 'INTEGER');
  ensureColumn('calls', 'ended_at', 'TEXT');
  ensureColumn('opportunities', 'pipeline_id', 'INTEGER');
  ensureColumn('opportunities', 'stage_id', 'INTEGER');
  ensureColumn('opportunities', 'title', 'TEXT');
  seedCadence(db);
  seedDefaultPipeline(db);
}

export function resetDb() {
  db.exec(`
    DROP TABLE IF EXISTS calls;
    DROP TABLE IF EXISTS integration_events;
    DROP TABLE IF EXISTS lead_notes;
    DROP TABLE IF EXISTS opportunities;
    DROP TABLE IF EXISTS pipeline_stages;
    DROP TABLE IF EXISTS pipelines;
    DROP TABLE IF EXISTS timeline;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS cadences;
    DROP TABLE IF EXISTS leads;
    DROP TABLE IF EXISTS phones;
    DROP TABLE IF EXISTS contacts;
    DROP TABLE IF EXISTS companies;
    DROP TABLE IF EXISTS settings;
  `);
  initDb();
}

export function tableCount(table) {
  return db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, nowIso());
}
