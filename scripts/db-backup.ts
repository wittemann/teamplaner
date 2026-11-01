// npm run db:backup[:neon] – writes all data to backups/<neon|local>-<date>.json (gitignored) and keeps
// the newest 8 per database. A weekly Claude task runs it for Neon (docs/tech.md, "Backup").
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { exportData } from '../src/lib/backup.ts';
import { openScriptDb } from './lib/script-db.ts';

const DIR = 'backups';
const KEEP = 8;

const db = await openScriptDb();
try {
  const backup = await exportData(db);
  const prefix = db.remote ? 'neon' : 'local';
  const file = `${DIR}/${prefix}-${backup.createdAt.replaceAll(':', '-').slice(0, 19)}.json`;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(backup, null, 2));
  const rows = Object.values(backup.tables).reduce((sum, t) => sum + t.length, 0);
  console.log(`${rows} rows from ${db.remote ? 'Neon' : 'the local database'} → ${file}`);
  // Names sort by date; delete all but the newest
  const old = readdirSync(DIR)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.json'))
    .sort()
    .slice(0, -KEEP);
  for (const f of old) rmSync(`${DIR}/${f}`);
  if (old.length > 0) console.log(`Deleted ${old.length} older backup(s)`);
} finally {
  await db.close();
}
