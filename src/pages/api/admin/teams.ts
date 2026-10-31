// GET: all teams with children, their parents and coaches. POST: new team ({ name, season }).
import { createTeam, listTeams, teamInput } from '../../../lib/admin/data.ts';
import { adminRoute, body } from '../../../lib/admin/route.ts';

export const GET = adminRoute((_, db) => listTeams(db));
export const POST = adminRoute(async (context, db) =>
  createTeam(db, await body(context, teamInput)),
);
