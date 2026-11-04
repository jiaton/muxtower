// Writes the page's HTML into dist/index.html (from the SSR build in dist-ssr/), so the page reads and
// ranks before its script runs; main.tsx then hydrates it.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const site = fileURLToPath(new URL('..', import.meta.url))
const { render } = await import(`${site}dist-ssr/entry-server.js`)
const file = `${site}dist/index.html`
const html = readFileSync(file, 'utf8')
if (!html.includes('<!--app-->')) throw new Error('dist/index.html has no <!--app--> placeholder')
// Link previews (LinkedIn, Slack, X) want the share image at an absolute URL, which only the deployment
// knows: MUXTOWER_SITE_DOMAIN (the same variable that binds the domain in deploy/). Unset, no preview tags.
const domain = process.env.MUXTOWER_SITE_DOMAIN?.trim()
const preview = domain
  ? [
      `<meta property="og:url" content="https://${domain}/" />`,
      `<meta property="og:image" content="https://${domain}/og.png" />`,
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta name="twitter:card" content="summary_large_image" />',
    ].join('\n    ')
  : ''
writeFileSync(file, html.replace('<!--app-->', render()).replace('<!--preview-->', preview))
rmSync(`${site}dist-ssr`, { recursive: true, force: true })
console.log('prerendered dist/index.html')
