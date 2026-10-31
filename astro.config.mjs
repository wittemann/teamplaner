// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';
import preact from '@astrojs/preact';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Production address: links in mails sent by the cron (no request to take the address from)
  site: 'https://team.bretten-kangaroos.net',
  output: 'server',
  adapter: vercel(),
  // Islands only, like the rezepte app
  integrations: [preact()],
  vite: { plugins: [tailwindcss()] },
  // Fonts of the homepage (docs/design.md), downloaded at build time and served from our own
  // domain, so parents' browsers never contact a font CDN.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Barlow',
      cssVariable: '--font-barlow',
      weights: ['400', '500', '600'],
      styles: ['normal'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Barlow Condensed',
      cssVariable: '--font-barlow-condensed',
      weights: ['600', '700'],
      styles: ['normal'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
  ],
  env: {
    schema: {
      // Neon. Optional: without it the app uses the local PGlite database (src/lib/db/client.ts)
      DATABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // SHA-256 (hex) of the Admin-API token Claude uses. Without it the Admin API answers 401.
      ADMIN_TOKEN_HASH: envField.string({ context: 'server', access: 'secret', optional: true }),
      // 32 random bytes (base64url) to store personal links encrypted, so "Link verloren?" can mail
      // them again (src/lib/token.ts). Without it a lost link is replaced by a new one.
      LINK_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Mail through the club's IONOS mailbox. Without SMTP_HOST mails go to the console (dev only).
      SMTP_HOST: envField.string({ context: 'server', access: 'secret', optional: true }),
      SMTP_PORT: envField.number({ context: 'server', access: 'secret', default: 587 }),
      SMTP_USER: envField.string({ context: 'server', access: 'secret', optional: true }),
      SMTP_PASS: envField.string({ context: 'server', access: 'secret', optional: true }),
      // e.g. "Bretten Kangaroos <teamplaner@bretten-kangaroos.net>"; default: SMTP_USER
      MAIL_FROM: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Vercel sends it to the cron endpoint (/api/cron/reminders); without it the cron does nothing
      CRON_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Web Push (src/lib/push.ts), a pair from `npx web-push generate-vapid-keys`. Without them
      // the pages don't offer notifications and everything goes by mail.
      VAPID_PUBLIC_KEY: envField.string({ context: 'server', access: 'public', optional: true }),
      VAPID_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Contact for the push services, required by the VAPID standard
      VAPID_SUBJECT: envField.string({
        context: 'server',
        access: 'public',
        default: 'mailto:teamplaner@bretten-kangaroos.net',
      }),
    },
  },
});
