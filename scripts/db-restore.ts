// npm run db:restore[:neon] -- <backup.json> – migrates the database, then writes the backup into it.
// Only into an empty database (e.g. a new Neon branch), all in one transaction (docs/tech.md, "Backup").
import { readFileSync } from 'node:fs';
import { restoreData, type Backup } from '../src/lib/backup.ts';
import { migrate } from './lib/migrate.ts';
import { openScriptDb } from './lib/script-db.ts';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run db:restore -- <backup.json>');
  process.exit(1);
}
const backup = JSON.parse(readFileSync(file, 'utf8')) as Backup;

const db = await openScriptDb();
try {
  await migrate(db);
  await db.exec('BEGIN');
  try {
    const counts = await restoreData(db, backup);
    await db.exec('COMMIT');
    for (const [table, rows] of Object.entries(counts)) console.log(`  ${table}: ${rows}`);
    console.log(
      `Restored backup from ${backup.createdAt} into ${db.remote ? 'Neon' : 'the local database'}.`,
    );
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
} finally {
  await db.close();
}
