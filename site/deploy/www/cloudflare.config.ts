// The www host: a Worker of its own that only redirects to the apex (index.ts). Deployed with
// `npm ci && npx cf deploy` from this folder.
import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'muxtower-www',
    compatibilityDate: '2026-10-01',
    entrypoint: './index.ts',
    domains: ['www.muxtower.dev'],
  },
})
