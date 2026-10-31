// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';
import preact from '@astrojs/preact';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
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
    },
  },
});
