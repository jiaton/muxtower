// After `vite build`: writes dist/config.json from MUXTOWER_APP_CONFIG (a JSON string), so preset daemons
// come from the deploy platform's secrets instead of the repository. Prints a warning when it ships tokens.
import { writeFileSync } from 'node:fs'

const raw = process.env.MUXTOWER_APP_CONFIG
if (!raw) process.exit(0) // keep the empty public/config.json

let config
try {
  config = JSON.parse(raw)
} catch {
  console.error('MUXTOWER_APP_CONFIG is not valid JSON')
  process.exit(1)
}
const withTokens = (config.daemons ?? []).filter((d) => d.token)
if (withTokens.length) {
  if (!config.acknowledge_public_tokens) {
    console.error('MUXTOWER_APP_CONFIG contains tokens but not "acknowledge_public_tokens": true; refusing to build.')
    process.exit(1)
  }
  console.warn(
    `warning: config.json will contain ${withTokens.length} daemon token(s). Anyone who can load this site can ` +
      'read them: serve it only behind an access gate (Cloudflare Access, your own SSO).',
  )
}
writeFileSync(new URL('../dist/config.json', import.meta.url), JSON.stringify(config))
console.log('wrote dist/config.json')
