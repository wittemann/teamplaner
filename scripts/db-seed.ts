// npm run db:seed – fills an empty database with demo data and prints parent links.
// Locally the tokens are readable (dev-mueller); on Neon they are random, since the app is online.
import { hashToken, newAccessToken } from '../src/lib/token.ts';
import { seedDemo } from './lib/demo-data.ts';
import { openScriptDb } from './lib/script-db.ts';

const BASE_URL = process.env.SEED_BASE_URL ?? 'http://localhost:4321';

function readableToken(lastName: string) {
  const ascii = lastName.toLowerCase().replace('ü', 'ue').replace('ä', 'ae').replace('ö', 'oe');
  return `dev-${ascii}`;
}

const db = await openScriptDb();
try {
  const [{ teams }] = await db.query<{ teams: number }>('SELECT count(*)::int AS teams FROM team');
  if (teams > 0)
    throw new Error('The database already has teams. db:seed only fills an empty one.');
  const tokens = await seedDemo(db, db.remote ? () => newAccessToken() : readableToken);
  console.log('Demo data added. Parent links, e.g.:');
  for (const name of ['Müller', 'Schmidt', 'Schulz']) {
    console.log(`  ${name}: ${BASE_URL}/f/${tokens.get(name)}`);
  }
  // A demo coach for both teams, locally only; real coaches come through the Admin API
  if (!db.remote) {
    await db.query(
      `INSERT INTO coach (name, email, is_admin, access_token_hash)
       VALUES ('Demo-Trainer', 'dev-trainer@example.org', true, $1)`,
      [hashToken('dev-trainer')],
    );
    console.log(`Coach link: ${BASE_URL}/t/dev-trainer`);
  }
} finally {
  await db.close();
}
