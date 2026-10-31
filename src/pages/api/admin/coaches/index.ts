// POST { name, email, isAdmin?, teamIds }: a coach with a personal link to the coach area.
import { LINK_KEY } from 'astro:env/server';
import { coachInput, createCoach } from '../../../../lib/admin/data.ts';
import { adminRoute, body, linkFor } from '../../../../lib/admin/route.ts';

export const POST = adminRoute(async (context, db) => {
  const { token, ...coach } = await createCoach(db, await body(context, coachInput), LINK_KEY);
  return { ...coach, link: linkFor(context, 't', token) };
});
