// Personal parent link: remembers the family in a cookie and redirects to /, so the token
// doesn't stay in the address bar (or in screenshots, history, shared links).
import type { APIRoute } from 'astro';
import { LINK_KEY } from 'astro:env/server';
import { FAMILY_COOKIE, LINK_COOKIE_OPTIONS } from '../../lib/cookie.ts';
import { getDb } from '../../lib/db/index.ts';
import { rememberLink } from '../../lib/lost-link.ts';
import { findGuardianByToken } from '../../lib/season.ts';

export const GET: APIRoute = async ({ params, cookies, redirect }) => {
  const token = params.token ?? '';
  const db = await getDb();
  const guardian = await findGuardianByToken(db, token);
  if (!guardian) {
    // Don't keep showing another family from an older link on this device
    cookies.delete(FAMILY_COOKIE, { path: '/' });
    return redirect('/?link=ungueltig');
  }
  // Links from before "Link verloren?" are stored encrypted the first time they are opened
  await rememberLink(db, 'guardian', guardian.id, token, LINK_KEY);
  cookies.set(FAMILY_COOKIE, token, LINK_COOKIE_OPTIONS);
  return redirect('/');
};
