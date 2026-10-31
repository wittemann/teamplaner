// POST { teamId?, mode?: "all" | "due", dryRun? }: reminder mails to families with open games.
// "all" (default) = everyone with open games, e.g. 3 days after the season links went out;
// "due" = what the daily cron sends. dryRun lists the recipients without sending.
import { LINK_KEY } from 'astro:env/server';
import { z } from 'astro/zod';
import { adminRoute, body } from '../../../lib/admin/route.ts';
import { sendMail } from '../../../lib/mail.ts';
import { sendReminders } from '../../../lib/reminders.ts';

const reminderInput = z.object({
  teamId: z.uuid().optional(),
  mode: z.enum(['all', 'due']).default('all'),
  dryRun: z.boolean().default(false),
});

export const POST = adminRoute(async (context, db) => {
  const input = await body(context, reminderInput);
  const reminders = await sendReminders(db, input, {
    origin: context.url.origin,
    key: LINK_KEY,
    send: sendMail,
  });
  return { dryRun: input.dryRun, reminders };
});
