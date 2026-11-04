// The public hosted copy of the web app: Cloudflare Workers static assets, deployed with the `cf` CLI by
// `make public-app` from a release tag. It is the real app, which people pair with their own daemons,
// on an origin of its own (never under the website's, whose demo runs the same code against simulated
// daemons and would share localStorage, where the app keeps daemon tokens, and service-worker scope).
// The hostname is the deployment's, never this file's: unset MUXTOWER_APP_DOMAIN keeps the Worker on
// its workers.dev address; set, it binds that custom domain instead.
import { defineConfig } from 'cf/config'

const domain = process.env.MUXTOWER_APP_DOMAIN?.trim()

export default defineConfig({
  worker: {
    name: 'muxtower-app',
    compatibilityDate: '2026-10-01',
    // The app routes by path: every unknown path serves index.html.
    assets: { notFoundHandling: 'single-page-application' },
    ...(domain ? { domains: [domain] } : { workersDev: true }),
  },
})
