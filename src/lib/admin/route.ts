// Shared frame of the Admin API (/api/admin/*, docs/tech.md "Anbindung an Claude"): checks the
// admin token, answers in JSON and turns invalid input into a 400 with the zod issues.
// The token is only for Martin's Claude Code; the server knows just its SHA-256 hash.
import type { APIContext, APIRoute } from 'astro';
import { ADMIN_TOKEN_HASH } from 'astro:env/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'astro/zod';
import type { Db } from '../db/client.ts';
import { getDb } from '../db/index.ts';
import { hashToken } from '../token.ts';

export class NotFound extends Error {}

function isAdmin(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token || !ADMIN_TOKEN_HASH) return false;
  const given = Buffer.from(hashToken(token));
  const expected = Buffer.from(ADMIN_TOKEN_HASH);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Wraps an endpoint: 401 without the admin token, 400/404 for bad input, JSON for the rest. */
// eslint-disable-next-line no-restricted-syntax -- Astro needs APIRoute for the exported GET/POST
export function adminRoute(handler: (context: APIContext, db: Db) => Promise<unknown>): APIRoute {
  return async (context) => {
    if (!isAdmin(context.request)) return json({ error: 'unauthorized' }, 401);
    try {
      return json(await handler(context, await getDb()));
    } catch (error) {
      if (error instanceof z.ZodError) return json({ error: 'invalid', issues: error.issues }, 400);
      if (error instanceof NotFound)
        return json({ error: 'not found', detail: error.message }, 404);
      throw error;
    }
  };
}

/** Reads and validates the JSON body. */
export async function body<T extends z.ZodType>(context: APIContext, schema: T) {
  return schema.parse(await context.request.json()) as z.infer<T>;
}

/** Absolute link for a personal token, on the domain the request came in on. */
export function linkFor(context: APIContext, kind: 'f' | 't', token: string) {
  return new URL(`/${kind}/${token}`, context.url.origin).toString();
}
