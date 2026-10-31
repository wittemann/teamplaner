// Finds the family behind the personal-link cookie (set by /f/<token>, docs/tech.md "Auth").
// Pages and actions decide themselves what to do without one.
import { defineMiddleware } from 'astro:middleware';
import { FAMILY_COOKIE } from './lib/cookie.ts';
import { getDb } from './lib/db/index.ts';
import { findGuardianByToken } from './lib/season.ts';

export const onRequest = defineMiddleware(async (context, next) => {
  const token = context.cookies.get(FAMILY_COOKIE)?.value;
  if (token) context.locals.guardian = await findGuardianByToken(await getDb(), token);
  return next();
});
