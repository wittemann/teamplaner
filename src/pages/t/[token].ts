// Personal coach link: like the parent link (/f/<token>), but leads to the coach area.
import type { APIRoute } from 'astro';
import { findCoachByToken } from '../../lib/coach.ts';
import { COACH_COOKIE, LINK_COOKIE_OPTIONS } from '../../lib/cookie.ts';
import { getDb } from '../../lib/db/index.ts';

export const GET: APIRoute = async ({ params, cookies, redirect }) => {
  const token = params.token ?? '';
  const coach = await findCoachByToken(await getDb(), token);
  if (!coach) {
    cookies.delete(COACH_COOKIE, { path: '/' });
    return redirect('/trainer?link=ungueltig');
  }
  cookies.set(COACH_COOKIE, token, LINK_COOKIE_OPTIONS);
  return redirect('/trainer');
};
