// Cloudflare Workers static assets, deployed with the `cf` CLI: `npm run deploy`. The files served are
// `../dist` (wrangler.config.ts). The hostname is the deployment's, never this file's: set
// MUXTOWER_SITE_DOMAIN when deploying to serve the site on it (a custom domain of the Worker; Cloudflare
// adds its DNS record and certificate). Unset, the Worker keeps only its workers.dev address.
import { defineConfig } from 'cf/config'

const domain = process.env.MUXTOWER_SITE_DOMAIN?.trim()

export default defineConfig({
  worker: {
    name: 'muxtower-site',
    compatibilityDate: '2026-10-01',
    // Every page is a file: the site is one page, and the demo one more (it routes by the URL's hash).
    // Anything else is a plain 404.
    assets: { notFoundHandling: 'none' },
    ...(domain ? { domains: [domain] } : {}),
  },
})
