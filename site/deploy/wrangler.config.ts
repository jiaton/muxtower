// The build tool `cf` deploys with. It only collects files: `npm run build` makes them (prerendered site, demo).
import { defineWranglerConfig } from 'wrangler/experimental-config'

export default defineWranglerConfig({ assetsDirectory: '../dist', types: { generate: false } })
