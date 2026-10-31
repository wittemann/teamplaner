// Applies the files in db/migrations/ that haven't run yet, in name order, each in a transaction.
// The table schema_migration remembers which ones ran.
import { readdir, readFile } from 'node:fs/promises';
import type { ScriptDb } from './script-db.ts';

const DIR = new URL('../../db/migrations/', import.meta.url);

export async function migrate(db: ScriptDb) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const done = new Set(
    (await db.query<{ name: string }>('SELECT name FROM schema_migration')).map((r) => r.name),
  );
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files.filter((f) => !done.has(f))) {
    const sql = await readFile(new URL(file, DIR), 'utf8');
    await db.exec('BEGIN');
    try {
      await db.exec(sql);
      await db.query('INSERT INTO schema_migration (name) VALUES ($1)', [file]);
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed`, { cause: error });
    }
    applied.push(file);
  }
  return applied;
}
