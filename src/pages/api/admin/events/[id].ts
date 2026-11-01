// PATCH: changes fields of an event (time, place, coach note, cancelled, …). Tells nobody unless
// the body says notify: true; then families hear what the coach area would tell them.
// DELETE [?force=true]: removes an event, see deleteEvent.
import { LINK_KEY } from 'astro:env/server';
import { z } from 'astro/zod';
import { deleteEvent, updateEvent, updateEventInput } from '../../../../lib/admin/data.ts';
import { adminRoute, body, NotFound } from '../../../../lib/admin/route.ts';
import { eventDetail } from '../../../../lib/coach.ts';
import { notifyEventChange } from '../../../../lib/event-change.ts';
import { sendMail } from '../../../../lib/mail.ts';
import { pushSender } from '../../../../lib/push-sender.ts';

const patchInput = updateEventInput.extend({ notify: z.boolean().default(false) });

export const PATCH = adminRoute(async (context, db) => {
  const id = z.uuid().parse(context.params.id);
  const { notify, ...fields } = await body(context, patchInput);
  if (!notify) return updateEvent(db, id, fields);
  const before = await eventDetail(db, id);
  if (!before) throw new NotFound(`event ${id}`);
  const updated = await updateEvent(db, id, fields);
  const after = (await eventDetail(db, id))!;
  const notified = await notifyEventChange(db, before.event, after.event, {
    origin: context.url.origin,
    key: LINK_KEY,
    send: sendMail,
    push: pushSender(),
  });
  return { ...updated, notified };
});

export const DELETE = adminRoute(async ({ params, url }, db) =>
  deleteEvent(db, z.uuid().parse(params.id), url.searchParams.get('force') === 'true'),
);
