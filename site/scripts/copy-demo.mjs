// Puts the app's demo build (app/dist-demo, `npm run build:demo` there) at dist/demo/, where the page's
// phone frame loads it. The demo routes by the URL's hash, so its one index.html serves every page of it.
// Without a build, a placeholder page stands in, so the frame never shows the site itself.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const site = fileURLToPath(new URL('..', import.meta.url))
const from = `${site}../app/dist-demo`
const to = `${site}dist/demo`
rmSync(to, { recursive: true, force: true })
if (existsSync(`${from}/index.html`)) {
  cpSync(from, to, { recursive: true })
  console.log('copied the demo app to dist/demo')
} else {
  console.warn('warning: app/dist-demo is missing (run `npm run build:demo` in app/); dist/demo is a placeholder')
  mkdirSync(to, { recursive: true })
  writeFileSync(
    `${to}/index.html`,
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
      '<title>muxtower demo</title><body style="font:14px system-ui;display:grid;place-items:center;height:100vh;margin:0">' +
      '<p>The demo app is not built yet.</p>',
  )
}
