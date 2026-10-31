// Daily reminder run (vercel.json "crons", docs/tech.md "Automatische Erinnerungen"). Vercel calls
// it with "Authorization: Bearer <CRON_SECRET>"; without the secret set, it does nothing.
import type { APIRoute } from 'astro';
import { CRON_SECRET, LINK_KEY } from 'astro:env/server';
import { getDb } from '../../../lib/db/index.ts';
import { sendMail } from '../../../lib/mail.ts';
import { sendReminders } from '../../../lib/reminders.ts';

export const GET: APIRoute = async ({ request, site, url }) => {
  if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }
  // Links in the mails always lead to the production address, not to the deployment's own URL
  const origin = import.meta.env.PROD && site ? site.origin : url.origin;
  const results = await sendReminders(
    await getDb(),
    { mode: 'due' },
    { origin, key: LINK_KEY, send: sendMail },
  );
  const sent = results.filter((r) => r.sent).length;
  const failed = results.filter((r) => r.error).length;
  // Counts only: no names or addresses in the logs
  console.info(`reminders: ${sent} sent, ${failed} failed`);
  return Response.json({ sent, failed });
};
