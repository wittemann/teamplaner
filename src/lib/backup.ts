// Backup of all data as one JSON file (docs/tech.md, "Backup"). Neon's free plan keeps no backups
// and restores only 6 hours back, so a weekly Claude task on Martin's Mac
// saves this file (scripts/db-backup.ts).
// Postgres converts rows to JSON and back (json_agg / json_populate_recordset), so every column
// type survives the round trip without code here knowing the tables.
import type { Db } from './db/client.ts';

export type Backup = {
  createdAt: string;
  /** Applied migrations: a backup only fits a database with the same schema */
  migrations: string[];
  tables: Record<string, Record<string, unknown>[]>;
};

const MIGRATION_TABLE = 'schema_migration';

async function tableNames(db: Db) {
  const rows = await db.query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((r) => r.name);
}

async function migrations(db: Db) {
  const tables = await tableNames(db);
  if (!tables.includes(MIGRATION_TABLE)) return [];
  const rows = await db.query<{ name: string }>(
    `SELECT name FROM ${MIGRATION_TABLE} ORDER BY name`,
  );
  return rows.map((r) => r.name);
}

/** Tables in an order where every table comes after the tables it references. */
async function insertOrder(db: Db, tables: string[]) {
  const refs = await db.query<{ child: string; parent: string }>(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
     FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE c.contype = 'f' AND n.nspname = 'public'`,
  );
  const ordered: string[] = [];
  const visit = (table: string) => {
    if (ordered.includes(table)) return;
    for (const { parent } of refs.filter((r) => r.child === table && r.parent !== table)) {
      visit(parent);
    }
    ordered.push(table);
  };
  tables.forEach(visit);
  return ordered.filter((t) => tables.includes(t));
}

export async function exportData(db: Db, now = new Date()) {
  const tables: Backup['tables'] = {};
  for (const name of await tableNames(db)) {
    if (name === MIGRATION_TABLE) continue;
    const [{ rows }] = await db.query<{ rows: Record<string, unknown>[] }>(
      `SELECT coalesce(json_agg(t ORDER BY t::text), '[]') AS rows FROM "${name}" t`,
    );
    tables[name] = rows;
  }
  const backup: Backup = {
    createdAt: now.toISOString(),
    migrations: await migrations(db),
    tables,
  };
  return backup;
}

/**
 * Writes a backup into a database with the same migrations and no data. Run it inside a
 * transaction (scripts/db-restore.ts), so a failure leaves the database empty.
 */
export async function restoreData(db: Db, backup: Backup) {
  const current = await migrations(db);
  if (current.join() !== backup.migrations.join()) {
    throw new Error(
      `Schema differs: backup has ${backup.migrations.at(-1) ?? 'no migrations'}, database has ${current.at(-1) ?? 'none'}`,
    );
  }
  const existing = await tableNames(db);
  const missing = Object.keys(backup.tables).filter((t) => !existing.includes(t));
  if (missing.length > 0) throw new Error(`Tables missing in the database: ${missing.join(', ')}`);
  for (const name of existing.filter((t) => t !== MIGRATION_TABLE)) {
    const [{ filled }] = await db.query<{ filled: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM "${name}") AS filled`,
    );
    if (filled) throw new Error(`Table ${name} is not empty; restore only into an empty database`);
  }
  const counts: Record<string, number> = {};
  for (const name of await insertOrder(db, Object.keys(backup.tables))) {
    const rows = backup.tables[name];
    if (rows.length > 0) {
      await db.query(
        `INSERT INTO "${name}" SELECT * FROM json_populate_recordset(null::"${name}", $1::json)`,
        [JSON.stringify(rows)],
      );
    }
    counts[name] = rows.length;
  }
  return counts;
}
