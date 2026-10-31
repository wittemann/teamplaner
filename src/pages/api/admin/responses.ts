// PUT { eventId, playerId, status: 'in' | 'out' | null }: answers for a child, e.g. when a parent
// told the coach in person. Saved as responded_by 'claude'.
import { responseInput, setResponse } from '../../../lib/admin/data.ts';
import { adminRoute, body } from '../../../lib/admin/route.ts';

export const PUT = adminRoute(async (context, db) =>
  setResponse(db, await body(context, responseInput)),
);
