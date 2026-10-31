// Web-App-Manifest for "Zum Home-Bildschirm" (docs/tech.md, "Web Push"). The start address is the
// personal link of the cookie: an installed app may not share the browser's cookies (iPhone), and
// /f/<token> sets the cookie again. The coach area (?bereich=trainer) installs as its own app.
import type { APIRoute } from 'astro';
import { COACH_COOKIE, FAMILY_COOKIE } from '../lib/cookie.ts';

export const GET: APIRoute = ({ url, cookies }) => {
  const coach = url.searchParams.get('bereich') === 'trainer';
  const token = cookies.get(coach ? COACH_COOKIE : FAMILY_COOKIE)?.value;
  const home = coach ? '/trainer' : '/';
  const manifest = {
    id: home,
    name: coach ? 'Kangaroos Trainer' : 'Kangaroos Teamplaner',
    // Short: the iPhone cuts longer names on the home screen
    short_name: coach ? 'Kangaroos Trainer' : 'Teamplaner',
    lang: 'de',
    start_url: token ? `${coach ? '/t/' : '/f/'}${encodeURIComponent(token)}` : home,
    scope: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#23461E',
    // White background: the crest is mostly white and vanishes on dark home screens
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      'content-type': 'application/manifest+json',
      // Holds the personal link: never in a shared cache
      'cache-control': 'private, no-store',
    },
  });
};
