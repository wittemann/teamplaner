// POST: new personal link for a coach; the old one stops working.
import { z } from 'astro/zod';
import { rotateToken } from '../../../../../lib/admin/data.ts';
import { adminRoute, linkFor } from '../../../../../lib/admin/route.ts';

export const POST = adminRoute(async (context, db) => {
  const token = await rotateToken(db, 'coach', z.uuid().parse(context.params.id));
  return { link: linkFor(context, 't', token) };
});
