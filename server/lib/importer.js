import { readSheet } from 'read-excel-file/node';
import { db } from './db.js';
import { createEnrichmentTask, createTimeline, LEAD_STATES } from './cadence.js';
import { nowIso } from './time.js';
import { stringifyJson } from './json.js';

const SOURCE_XLSX = 'PLANILHA_ENERGIA_SOLAR___CLOUD.xlsx';

function normalizeDigits(value) {
  if (value == null) return '';
  const raw = typeof value === 'number' ? String(Math.trunc(value)) : String(value);
  return raw.replace(/\D/g, '');
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function buildHeaderIndex(headers) {
  return headers.reduce((acc, header, index) => {
    if (header) acc[String(header).trim()] = index;
    return acc;
  }, {});
}

function get(row, headerIndex, key) {
  return row[headerIndex[key]];
}

function partnerNumbers(headers) {
  const nums = new Set();
  headers.forEach((header) => {
    const text = String(header || '');
    const match = text.match(/S[ÓO]CIO\s+0?(\d+)/i);
    if (match) nums.add(Number(match[1]));
  });
  return Array.from(nums).sort((a, b) => a - b);
}

function partnerKey(base, number) {
  const padded = String(number).padStart(2, '0');
  if (base === 'cpf') return `CPF SÓCIO ${padded}`;
  if (base === 'sum') return `TELEFONES SOMADOS SÓCIO ${padded}`;
  return `NOME SÓCIO ${number}`;
}

function extractPhones(row, headerIndex, partnerNumber) {
  const phones = [];
  const sum = get(row, headerIndex, partnerKey('sum', partnerNumber));
  if (sum) String(sum).split(',').forEach((value) => phones.push(normalizeDigits(value)));
  for (let i = 1; i <= 5; i += 1) {
    const key = `TELEFONE ${i} (SÓCIO ${String(partnerNumber).padStart(2, '0')})`;
    phones.push(normalizeDigits(get(row, headerIndex, key)));
  }
  return Array.from(new Set(phones.filter((phone) => phone.length >= 10)));
}

export async function importWorkbook({ resetExisting = false } = {}) {
  if (!resetExisting && db.prepare('SELECT id FROM companies LIMIT 1').get()) {
    return { skipped: true, ...counts() };
  }

  const { existsSync } = await import('node:fs');
  if (!existsSync(SOURCE_XLSX)) {
    return { skipped: true, reason: 'xlsx_not_found', ...counts() };
  }

  const rows = await readSheet(SOURCE_XLSX);
  const headers = rows[0].map((header) => String(header || '').trim());
  const headerIndex = buildHeaderIndex(headers);
  const partnerNums = partnerNumbers(headers);

  const insertCompany = db.prepare(`
    INSERT INTO companies (cnpj, legal_name, trade_name, opened_at, cnae, city, raw_json, source_row, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cnpj) DO UPDATE SET
      legal_name = excluded.legal_name,
      trade_name = excluded.trade_name,
      opened_at = excluded.opened_at,
      cnae = excluded.cnae,
      city = excluded.city,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
    RETURNING id
  `);
  const insertContact = db.prepare(`
    INSERT INTO contacts (company_id, cpf, name, role, is_primary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, name) DO UPDATE SET cpf = excluded.cpf, updated_at = excluded.updated_at
    RETURNING id
  `);
  const insertPhone = db.prepare(`
    INSERT INTO phones (company_id, contact_id, phone, source, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, phone) DO UPDATE SET contact_id = COALESCE(excluded.contact_id, contact_id), updated_at = excluded.updated_at
  `);
  const insertLead = db.prepare(`
    INSERT INTO leads (company_id, state, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(company_id) DO UPDATE SET updated_at = excluded.updated_at
    RETURNING id
  `);

  let imported = 0;
  let skipped = 0;
  db.exec('BEGIN');
  try {
    rows.slice(1).forEach((row, index) => {
      const legalName = clean(get(row, headerIndex, 'DSNOMERAZAO'));
      const cnpj = normalizeDigits(get(row, headerIndex, 'CNPJ'));
      if (!legalName || !cnpj) {
        skipped += 1;
        return;
      }
      const rawObject = headers.reduce((acc, header, columnIndex) => {
        const value = row[columnIndex];
        if (header && value !== null && value !== undefined && value !== '') acc[header] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
        return acc;
      }, {});
      const company = insertCompany.get(
        cnpj,
        legalName,
        clean(get(row, headerIndex, 'DSNOMEFANTASIA')),
        normalizeDate(get(row, headerIndex, 'DTABERTURA')),
        clean(get(row, headerIndex, 'CDCNAE')),
        clean(get(row, headerIndex, 'ENDEREÇO')),
        stringifyJson(rawObject),
        index + 2,
        nowIso(),
        nowIso()
      );
      let primaryContactId = null;
      let phonePriority = 1;
      partnerNums.forEach((number) => {
        const name = clean(get(row, headerIndex, partnerKey('name', number)));
        const cpf = clean(get(row, headerIndex, partnerKey('cpf', number)));
        if (!name) return;
        const contact = insertContact.get(company.id, cpf, name, 'Sócio', number === 1 ? 1 : 0, nowIso(), nowIso());
        if (number === 1) primaryContactId = contact.id;
        extractPhones(row, headerIndex, number).forEach((phone) => {
          insertPhone.run(company.id, contact.id, phone, `Sócio ${number}`, phonePriority, nowIso(), nowIso());
          phonePriority += 1;
        });
      });
      const lead = insertLead.get(company.id, LEAD_STATES.NEW, nowIso(), nowIso());
      const alreadyHasTask = db.prepare('SELECT id FROM tasks WHERE lead_id = ? LIMIT 1').get(lead.id);
      if (!alreadyHasTask) createEnrichmentTask(db, lead.id);
      createTimeline(db, lead.id, 'LEAD_IMPORTED', 'Lead importado da planilha', { source: SOURCE_XLSX, primaryContactId });
      imported += 1;
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { skipped: false, imported, ignoredRows: skipped, ...counts() };
}

export function counts() {
  const leadPhones = db.prepare(`
    SELECT l.id, COUNT(p.id) AS phones
      FROM leads l
      JOIN companies c ON c.id = l.company_id
      LEFT JOIN phones p ON p.company_id = c.id
     GROUP BY l.id
  `).all();
  return {
    companies: db.prepare('SELECT COUNT(*) AS total FROM companies').get().total,
    leads: db.prepare('SELECT COUNT(*) AS total FROM leads').get().total,
    contacts: db.prepare('SELECT COUNT(*) AS total FROM contacts').get().total,
    phones: db.prepare('SELECT COUNT(*) AS total FROM phones').get().total,
    leadsWithPhone: leadPhones.filter((row) => row.phones > 0).length,
    leadsWithoutPhone: leadPhones.filter((row) => row.phones === 0).length,
    enrichmentTasks: db.prepare("SELECT COUNT(*) AS total FROM tasks WHERE type = 'ENRICHMENT'").get().total
  };
}
