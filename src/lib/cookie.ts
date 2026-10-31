import type { AstroCookieSetOptions } from 'astro';

export const FAMILY_COOKIE = 'family';

// A year: the link doesn't expire, opening it again renews the cookie
export const FAMILY_COOKIE_OPTIONS: AstroCookieSetOptions = {
  path: '/',
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365,
};
