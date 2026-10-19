// Packs dist/ into an .ehpk for the Even Hub: app.json with the hub's origin as the only network
// permission. Needs a build made with MUXTOWER_G2_CONFIG (the hub is not the page's origin in a package).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const dist = new URL('../dist/', import.meta.url)
if (!existsSync(new URL('config.json', dist))) throw new Error('build with MUXTOWER_G2_CONFIG first: a package must know its hub')
const { hub } = JSON.parse(readFileSync(new URL('config.json', dist), 'utf8'))
const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'))
app.permissions = app.permissions.map((p) => (p.name === 'network' ? { ...p, whitelist: [new URL(hub).origin] } : p))
const manifest = new URL('../dist-app.json', import.meta.url).pathname
writeFileSync(manifest, JSON.stringify(app, null, 2))
execFileSync('npx', ['evenhub', 'pack', manifest, 'dist', '--output', 'muxtower-g2.ehpk'], { stdio: 'inherit' })
