// POST { name, email, phone?, players: [...] }: a parent with new or existing children.
// Returns the personal link once; it is not stored anywhere.
import { createFamily, familyInput } from '../../../lib/admin/data.ts';
import { adminRoute, body, linkFor } from '../../../lib/admin/route.ts';

export const POST = adminRoute(async (context, db) => {
  const { token, ...family } = await createFamily(db, await body(context, familyInput));
  return { ...family, link: linkFor(context, 'f', token) };
});
