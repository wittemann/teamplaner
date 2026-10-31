import type { AstroCookieSetOptions } from 'astro';

/** Personal link of a family (/f/<token>) */
export const FAMILY_COOKIE = 'family';
/** Personal link of a coach (/t/<token>) */
export const COACH_COOKIE = 'coach';

// A year: the links don't expire, opening one again renews the cookie
export const LINK_COOKIE_OPTIONS: AstroCookieSetOptions = {
  path: '/',
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365,
};
