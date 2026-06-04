import { resetDb } from '../lib/db.js';
import { importWorkbook } from '../lib/importer.js';

resetDb();
const result = await importWorkbook({ resetExisting: true });

console.log(JSON.stringify(result, null, 2));
