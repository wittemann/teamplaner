// Server actions for the parent page. They act only for the family of the cookie
// (src/middleware.ts) and only on its own children.
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { getDb } from '../lib/db/index.ts';
import { setResponses } from '../lib/season.ts';

export const server = {
  /** Sets one answer for several events (a single tap, or "Bei allen offenen Spielen dabei"). */
  setResponses: defineAction({
    input: z.object({
      playerId: z.uuid(),
      eventIds: z.array(z.uuid()).min(1).max(200),
      status: z.enum(['in', 'out']),
    }),
    handler: async ({ playerId, eventIds, status }, { locals }) => {
      if (!locals.guardian) throw new ActionError({ code: 'UNAUTHORIZED' });
      const saved = await setResponses(
        await getDb(),
        locals.guardian.id,
        playerId,
        eventIds,
        status,
      );
      // Nothing saved: not this family's child, or the events are cancelled, past or unknown
      if (saved.length === 0) throw new ActionError({ code: 'NOT_FOUND' });
      return { saved };
    },
  }),
};
