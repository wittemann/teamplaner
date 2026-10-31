// POST: new personal link for a parent (e.g. the old one was passed on); the old one stops working.
import { LINK_KEY } from 'astro:env/server';
import { z } from 'astro/zod';
import { rotateToken } from '../../../../../lib/admin/data.ts';
import { adminRoute, linkFor } from '../../../../../lib/admin/route.ts';

export const POST = adminRoute(async (context, db) => {
  const token = await rotateToken(db, 'guardian', z.uuid().parse(context.params.id), LINK_KEY);
  return { link: linkFor(context, 'f', token) };
});
