// Database connection for scripts: Neon when DATABASE_URL is set, otherwise the local PGlite
// database. Unlike the app (HTTP driver, one statement per call), scripts need one session
// that runs whole migration files and transactions, so Neon goes through a WebSocket client.
import { PGlite } from '@electric-sql/pglite';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { LOCAL_DB_DIR } from '../../src/lib/db/client.ts';

export type ScriptDb = {
  /** true = Neon */
  remote: boolean;
  /** Runs SQL with several statements and no parameters (migration files) */
  exec(sql: string): Promise<void>;
  query<Row>(text: string, params?: unknown[]): Promise<Row[]>;
  close(): Promise<void>;
};

// eslint-disable-next-line no-restricted-syntax -- one public type for both databases instead of a union
export async function openScriptDb(): Promise<ScriptDb> {
  const url = process.env.DATABASE_URL;
  if (url) {
    neonConfig.webSocketConstructor = WebSocket;
    const pool = new Pool({ connectionString: url });
    const client = await pool.connect();
    return {
      remote: true,
      exec: async (sql) => {
        await client.query(sql);
      },
      query: async <Row>(text: string, params: unknown[] = []) =>
        (await client.query(text, params)).rows as Row[],
      close: async () => {
        client.release();
        await pool.end();
      },
    };
  }
  const pg = new PGlite(LOCAL_DB_DIR);
  return {
    remote: false,
    exec: async (sql) => {
      await pg.exec(sql);
    },
    query: async <Row>(text: string, params: unknown[] = []) =>
      (await pg.query<Row>(text, params)).rows,
    close: () => pg.close(),
  };
}
