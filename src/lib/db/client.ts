// One small query interface for both databases: Neon in production and previews (HTTP driver,
// suits serverless functions), PGlite locally (Postgres compiled to WebAssembly, stored in
// .pglite/, nothing to install). Both speak the same SQL, so the queries don't care.

export type Db = {
  query<Row>(text: string, params?: unknown[]): Promise<Row[]>;
};

export const LOCAL_DB_DIR = '.pglite';

export async function createDb(databaseUrl: string | undefined) {
  if (databaseUrl) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(databaseUrl);
    return {
      query: async <Row>(text: string, params: unknown[] = []) =>
        (await sql.query(text, params)) as Row[],
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(LOCAL_DB_DIR);
  return {
    query: async <Row>(text: string, params: unknown[] = []) =>
      (await pg.query<Row>(text, params)).rows,
  };
}
