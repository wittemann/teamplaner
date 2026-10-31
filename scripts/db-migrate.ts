// npm run db:migrate – brings the database (Neon with DATABASE_URL, else local) up to date.
import { migrate } from './lib/migrate.ts';
import { openScriptDb } from './lib/script-db.ts';

const db = await openScriptDb();
try {
  const applied = await migrate(db);
  const where = db.remote ? 'Neon' : 'local database';
  console.log(
    applied.length ? `Applied to ${where}: ${applied.join(', ')}` : `${where} is up to date.`,
  );
} finally {
  await db.close();
}
