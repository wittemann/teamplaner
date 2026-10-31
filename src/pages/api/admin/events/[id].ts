// PATCH: changes fields of an event (time, place, coach note, cancelled, …).
import { z } from 'astro/zod';
import { updateEvent, updateEventInput } from '../../../../lib/admin/data.ts';
import { adminRoute, body } from '../../../../lib/admin/route.ts';

export const PATCH = adminRoute(async (context, db) =>
  updateEvent(db, z.uuid().parse(context.params.id), await body(context, updateEventInput)),
);
