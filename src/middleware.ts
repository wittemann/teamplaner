// Finds the family and the coach behind the personal-link cookies (set by /f/<token> and
// /t/<token>, docs/tech.md "Auth"). Pages and actions decide themselves what to do without one.
import { defineMiddleware } from 'astro:middleware';
import { findCoachByToken } from './lib/coach.ts';
import { COACH_COOKIE, FAMILY_COOKIE } from './lib/cookie.ts';
import { getDb } from './lib/db/index.ts';
import { findGuardianByToken } from './lib/season.ts';

export const onRequest = defineMiddleware(async (context, next) => {
  const familyToken = context.cookies.get(FAMILY_COOKIE)?.value;
  const coachToken = context.cookies.get(COACH_COOKIE)?.value;
  if (familyToken) context.locals.guardian = await findGuardianByToken(await getDb(), familyToken);
  if (coachToken) context.locals.coach = await findCoachByToken(await getDb(), coachToken);
  return next();
});
