// GET ?team=<id>[&from=<ISO date>]: upcoming events with counts and names.
// POST { teamId, events: [...] }: creates events (e.g. the season from the BSM, training series).
import { z } from 'astro/zod';
import { createEvents, createEventsInput, listEvents } from '../../../../lib/admin/data.ts';
import { adminRoute, body } from '../../../../lib/admin/route.ts';

const query = z.object({ team: z.uuid(), from: z.iso.datetime({ offset: true }).optional() });

export const GET = adminRoute(async ({ url }, db) => {
  const { team, from } = query.parse(Object.fromEntries(url.searchParams));
  return listEvents(db, team, from ? new Date(from) : new Date());
});
export const POST = adminRoute(async (context, db) =>
  createEvents(db, await body(context, createEventsInput)),
);
