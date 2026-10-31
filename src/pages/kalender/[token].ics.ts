// The calendar of a family (lib/calendar.ts). Calendar apps fetch it without cookies, so the
// token in the URL is the only key; an unknown one gets a plain 404.
import type { APIRoute } from 'astro';
import { findGuardianByCalendarToken, loadCalendar, toICal } from '../../lib/calendar.ts';
import { getDb } from '../../lib/db/index.ts';

// Keep the last four weeks, so past events don't vanish from the calendar right away
const HISTORY_DAYS = 28;

export const GET: APIRoute = async ({ params, url }) => {
  const db = await getDb();
  const guardian = params.token ? await findGuardianByCalendarToken(db, params.token) : undefined;
  if (!guardian) return new Response('Not found', { status: 404 });
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60_000);
  const events = await loadCalendar(db, guardian.id, since);
  return new Response(toICal(events, url.origin), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'private, max-age=900',
    },
  });
};
