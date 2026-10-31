// Personal coach link: like the parent link (/f/<token>), but leads to the coach area.
import type { APIRoute } from 'astro';
import { LINK_KEY } from 'astro:env/server';
import { findCoachByToken } from '../../lib/coach.ts';
import { COACH_COOKIE, LINK_COOKIE_OPTIONS } from '../../lib/cookie.ts';
import { getDb } from '../../lib/db/index.ts';
import { rememberLink } from '../../lib/lost-link.ts';

export const GET: APIRoute = async ({ params, cookies, redirect }) => {
  const token = params.token ?? '';
  const db = await getDb();
  const coach = await findCoachByToken(db, token);
  if (!coach) {
    cookies.delete(COACH_COOKIE, { path: '/' });
    return redirect('/trainer?link=ungueltig');
  }
  // Links from before "Link verloren?" are stored encrypted the first time they are opened
  await rememberLink(db, 'coach', coach.id, token, LINK_KEY);
  cookies.set(COACH_COOKIE, token, LINK_COOKIE_OPTIONS);
  return redirect('/trainer');
};
