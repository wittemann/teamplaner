// Server actions for the parent page. They act only for the family of the cookie
// (src/middleware.ts) and only on its own children.
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { addAbsence, removeAbsence } from '../lib/absence.ts';
import { getDb } from '../lib/db/index.ts';
import { withLateReport } from '../lib/late-change.ts';
import { sendMail } from '../lib/mail.ts';
import { setResponses } from '../lib/season.ts';

/** Changes after the deadline go to the coaches at once (lib/late-change.ts). */
function late(url: URL) {
  return { origin: url.origin, send: sendMail };
}

export const server = {
  /** Sets one answer for several events (a single tap, or "Bei allen offenen Spielen dabei"). */
  setResponses: defineAction({
    input: z.object({
      playerId: z.uuid(),
      eventIds: z.array(z.uuid()).min(1).max(200),
      status: z.enum(['in', 'out']),
    }),
    handler: async ({ playerId, eventIds, status }, { locals, url }) => {
      const guardian = locals.guardian;
      if (!guardian) throw new ActionError({ code: 'UNAUTHORIZED' });
      const db = await getDb();
      const saved = await withLateReport(db, guardian.id, late(url), () =>
        setResponses(db, guardian.id, playerId, eventIds, status),
      );
      // Nothing saved: not this family's child, or the events are cancelled, past or unknown
      if (saved.length === 0) throw new ActionError({ code: 'NOT_FOUND' });
      return { saved };
    },
  }),

  /** Records an absence period for some children; their events in it become "out". */
  addAbsence: defineAction({
    input: z
      .object({
        playerIds: z.array(z.uuid()).min(1).max(10),
        from: z.iso.date(),
        to: z.iso.date(),
        note: z.string().trim().max(200).optional(),
      })
      .refine((a) => a.to >= a.from, { message: 'Das Ende liegt vor dem Anfang.', path: ['to'] }),
    handler: async (input, { locals, url }) => {
      const guardian = locals.guardian;
      if (!guardian) throw new ActionError({ code: 'UNAUTHORIZED' });
      const db = await getDb();
      const result = await withLateReport(db, guardian.id, late(url), () =>
        addAbsence(db, guardian.id, { ...input, note: input.note || null }),
      );
      if (result.absences.length === 0) throw new ActionError({ code: 'NOT_FOUND' });
      return result;
    },
  }),

  /** Removes an absence and takes back the answers it set. */
  removeAbsence: defineAction({
    input: z.object({ absenceId: z.uuid() }),
    handler: async ({ absenceId }, { locals, url }) => {
      const guardian = locals.guardian;
      if (!guardian) throw new ActionError({ code: 'UNAUTHORIZED' });
      const db = await getDb();
      const changed = await withLateReport(db, guardian.id, late(url), () =>
        removeAbsence(db, guardian.id, absenceId),
      );
      if (!changed) throw new ActionError({ code: 'NOT_FOUND' });
      return { changed };
    },
  }),
};
