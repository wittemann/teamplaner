// npm run db:reset – recreates the LOCAL database (.pglite/): migrations + demo data.
// Refuses to run with DATABASE_URL set, so it can never wipe Neon.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { LOCAL_DB_DIR } from '../src/lib/db/client.ts';

if (process.env.DATABASE_URL) {
  console.error('DATABASE_URL is set: db:reset only resets the local database. Aborting.');
  process.exit(1);
}

rmSync(LOCAL_DB_DIR, { recursive: true, force: true });
for (const script of ['db-migrate.ts', 'db-seed.ts']) {
  execFileSync(process.execPath, [new URL(script, import.meta.url).pathname], { stdio: 'inherit' });
}
