// Personal parent link: remembers the family in a cookie and redirects to /, so the token
// doesn't stay in the address bar (or in screenshots, history, shared links).
import type { APIRoute } from 'astro';
import { FAMILY_COOKIE, LINK_COOKIE_OPTIONS } from '../../lib/cookie.ts';
import { getDb } from '../../lib/db/index.ts';
import { findGuardianByToken } from '../../lib/season.ts';

export const GET: APIRoute = async ({ params, cookies, redirect }) => {
  const token = params.token ?? '';
  const guardian = await findGuardianByToken(await getDb(), token);
  if (!guardian) {
    // Don't keep showing another family from an older link on this device
    cookies.delete(FAMILY_COOKIE, { path: '/' });
    return redirect('/?link=ungueltig');
  }
  cookies.set(FAMILY_COOKIE, token, LINK_COOKIE_OPTIONS);
  return redirect('/');
};
