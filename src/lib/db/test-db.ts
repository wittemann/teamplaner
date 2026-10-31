// An in-memory Postgres (PGlite) with all migrations, for tests that need real SQL.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from './client.ts';

const MIGRATIONS = new URL('../../../db/migrations/', import.meta.url);

export async function createTestDb() {
  const pg = new PGlite();
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await pg.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  const db: Db = {
    query: async <Row>(text: string, params: unknown[] = []) =>
      (await pg.query<Row>(text, params)).rows,
  };
  return { db, close: () => pg.close() };
}

/** Inserts a row and returns its id. */
export async function insert(db: Db, table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  const [inserted] = await db.query<{ id: string }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(row),
  );
  return inserted.id;
}
