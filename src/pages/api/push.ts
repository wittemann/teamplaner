// A device signs up for push (components/PushSetup.tsx) – for the family or the coach of the
// cookie, whichever page it was on. DELETE signs it off again.
import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { getDb } from '../../lib/db/index.ts';
import { removeSubscription, saveSubscription, type Owner } from '../../lib/push.ts';

const url = z.url({ protocol: /^https$/ }).max(1000);
const input = z.object({
  as: z.enum(['family', 'coach']),
  subscription: z.object({
    endpoint: url,
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  }),
});

async function parse(request: Request, locals: App.Locals) {
  const parsed = input.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return { error: new Response('Ungültige Anfrage', { status: 400 }) };
  const { as, subscription } = parsed.data;
  const owner: Owner | undefined =
    as === 'family'
      ? locals.guardian && { guardianId: locals.guardian.id }
      : locals.coach && { coachId: locals.coach.id };
  if (!owner) return { error: new Response('Bitte über deinen Link öffnen', { status: 401 }) };
  return { owner, subscription };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const { error, owner, subscription } = await parse(request, locals);
  if (error) return error;
  const userAgent = request.headers.get('user-agent')?.slice(0, 300) ?? null;
  await saveSubscription(await getDb(), owner, subscription, userAgent);
  return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const { error, owner, subscription } = await parse(request, locals);
  if (error) return error;
  await removeSubscription(await getDb(), owner, subscription.endpoint);
  return new Response(null, { status: 204 });
};
