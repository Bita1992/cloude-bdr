import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { db } from './db.js';
import { nowIso } from './time.js';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function clean(value) {
  return String(value || '').trim();
}

function parseCSV(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map((h) => clean(h));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(';');
    const row = {};
    headers.forEach((h, idx) => { row[h] = clean(values[idx]); });
    rows.push(row);
  }
  return rows;
}

function importFile(filePath) {
  const content = readFileSync(filePath, { encoding: 'utf-8' });
  const rows = parseCSV(content);
  const source = basename(filePath);

  // Agrupa por CNPJ — uma linha por telefone, mesma empresa pode aparecer N vezes
  const byCompany = {};
  for (const row of rows) {
    const cnpj = onlyDigits(row['CNPJ'] || row['Identificador'] || '');
    if (!cnpj || cnpj.length < 11) continue;

    if (!byCompany[cnpj]) {
      byCompany[cnpj] = {
        cnpj,
        empresa: clean(row['Empresa'] || ''),
        cidade: [clean(row['Cidade']), clean(row['UF'])].filter(Boolean).join('/'),
        cnae: clean(row['Atividade'] || ''),
        nome: clean(row['Nome'] || ''),
        email: clean(row['Email'] || ''),
        site: clean(row['Site'] || ''),
        instagram: clean(row['Instagram'] || ''),
        linkedin: clean(row['LinkedIn'] || ''),
        capitalSocial: clean(row['Capital_Social'] || ''),
        porte: clean(row['Porte_Empresa'] || ''),
        socios: clean(row['Socios'] || ''),
        phones: []
      };
    }

    const phone = onlyDigits(row['DDD + Telefone'] || '');
    const ownerName = clean(row['Nome'] || '');
    if (phone.length >= 10) {
      byCompany[cnpj].phones.push({ phone, source, ownerName });
    }
  }

  let imported = 0;
  let updated = 0;
  let phonesAdded = 0;

  const now = nowIso();

  for (const data of Object.values(byCompany)) {
    const rawJson = JSON.stringify({
      Email: data.email,
      Site: data.site,
      Instagram: data.instagram,
      LinkedIn: data.linkedin,
      Capital_Social: data.capitalSocial,
      Porte_Empresa: data.porte,
      Socios: data.socios,
      Atividade: data.cnae
    });

    db.prepare(`
      INSERT INTO companies (cnpj, legal_name, trade_name, city, cnae, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cnpj) DO UPDATE SET
        trade_name = COALESCE(NULLIF(excluded.trade_name, ''), companies.trade_name),
        city = COALESCE(NULLIF(excluded.city, ''), companies.city),
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(data.cnpj, data.empresa, data.empresa, data.cidade, data.cnae, rawJson, now, now);

    const company = db.prepare('SELECT id FROM companies WHERE cnpj = ?').get(data.cnpj);

    if (data.nome) {
      db.prepare(`
        INSERT INTO contacts (company_id, name, role, is_primary, created_at, updated_at)
        VALUES (?, ?, 'Decisor', 1, ?, ?)
        ON CONFLICT(company_id, name) DO NOTHING
      `).run(company.id, data.nome, now, now);
    }

    const existingLead = db.prepare('SELECT id FROM leads WHERE company_id = ?').get(company.id);
    if (!existingLead) {
      const enrichment = JSON.stringify({
        recipient_email: data.email,
        site: data.site,
        instagram: data.instagram,
        linkedin_company: data.linkedin,
        decision_maker: data.nome
      });
      db.prepare(`
        INSERT INTO leads (company_id, owner, state, current_cadence_step, enrichment_json, created_at, updated_at)
        VALUES (?, 'BDR', 'NEW', 1, ?, ?, ?)
      `).run(company.id, enrichment, now, now);
      imported++;
    } else {
      updated++;
    }

    for (const { phone, source: phoneSrc, ownerName } of data.phones) {
      const result = db.prepare(`
        INSERT INTO phones (company_id, phone, source, owner_name, is_valid, status, relationship, priority, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, 'UNVALIDATED', 'UNKNOWN', 50, ?, ?)
        ON CONFLICT(company_id, phone) DO UPDATE SET
          source = excluded.source,
          owner_name = COALESCE(NULLIF(excluded.owner_name, ''), phones.owner_name),
          updated_at = excluded.updated_at
      `).run(company.id, phone, phoneSrc, ownerName || null, now, now);
      if (result.changes > 0) phonesAdded++;
    }
  }

  return { companies: Object.keys(byCompany).length, imported, updated, phonesAdded };
}

export function importCsvDirectory(dirPath) {
  const files = readdirSync(dirPath).filter((f) => f.toLowerCase().endsWith('.csv')).sort();

  const totals = { files: files.length, companies: 0, imported: 0, updated: 0, phonesAdded: 0 };

  db.exec('BEGIN');
  try {
    for (const file of files) {
      const result = importFile(join(dirPath, file));
      totals.companies += result.companies;
      totals.imported += result.imported;
      totals.updated += result.updated;
      totals.phonesAdded += result.phonesAdded;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return totals;
}
