// Cloudflare Workers static assets, deployed with the `cf` CLI: `npm run deploy`. The hostname is the
// deployment's (set in the dashboard), not this file's; the files served are `../dist` (wrangler.config.ts).
import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'muxtower-site',
    compatibilityDate: '2026-10-01',
    // Every page is a file: the site is one page, and the demo one more (it routes by the URL's hash).
    // Anything else is a plain 404.
    assets: { notFoundHandling: 'none' },
  },
})
