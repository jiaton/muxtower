// A packaged build talks to a hub that is not its own origin: MUXTOWER_G2_CONFIG (JSON, see
// src/hub/config.ts) is written to dist/config.json. Without it the build is the one the hub serves at /g2/.
import { writeFileSync } from 'node:fs'

const raw = process.env.MUXTOWER_G2_CONFIG
if (raw) {
  const config = JSON.parse(raw)
  if (typeof config.hub !== 'string' || !/^https?:\/\//.test(config.hub)) throw new Error('MUXTOWER_G2_CONFIG needs "hub": "https://…"')
  writeFileSync(new URL('../dist/config.json', import.meta.url), JSON.stringify(config))
  console.log(`dist/config.json written for ${config.hub}`)
}
