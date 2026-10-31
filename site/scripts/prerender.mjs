// Writes the page's HTML into dist/index.html (from the SSR build in dist-ssr/), so the page reads and
// ranks before its script runs; main.tsx then hydrates it.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const site = fileURLToPath(new URL('..', import.meta.url))
const { render } = await import(`${site}dist-ssr/entry-server.js`)
const file = `${site}dist/index.html`
const html = readFileSync(file, 'utf8')
if (!html.includes('<!--app-->')) throw new Error('dist/index.html has no <!--app--> placeholder')
writeFileSync(file, html.replace('<!--app-->', render()))
rmSync(`${site}dist-ssr`, { recursive: true, force: true })
console.log('prerendered dist/index.html')
