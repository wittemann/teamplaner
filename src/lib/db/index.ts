import { DATABASE_URL } from 'astro:env/server';
import { createDb, type Db } from './client.ts';

let db: Promise<Db> | undefined;

/** The app's database, opened once per server instance. */
export function getDb() {
  db ??= createDb(DATABASE_URL);
  return db;
}
