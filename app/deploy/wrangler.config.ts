// The build tool `cf` deploys with. It only collects files: `npm run build` in ../ makes them.
import { defineWranglerConfig } from 'wrangler/experimental-config'

export default defineWranglerConfig({ assetsDirectory: '../dist', types: { generate: false } })
