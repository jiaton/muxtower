import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// The recover script is inline in index.html (it must run before any module). Run it as each page load would.
const html = readFileSync('index.html', 'utf8') // vitest runs in app/
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s?.includes('mxt-recover'))
if (!source) throw new Error('recover script not found in index.html')
const script = source.replace('%BASE_URL%', '/demo/') // as vite writes it for the demo's build

const realSession = globalThis.sessionStorage
const realLocal = globalThis.localStorage

type Listener = (e: { target?: unknown; preventDefault: () => void }) => void

/** One page load: the inline script, then (for the demo) its entry's storage swap. Returns what fails on
 *  that page: a lazy chunk (`vite:preloadError`), or the script at `src`; reloads are counted in `reloads`. */
async function load(demo: boolean, reloads: { count: number }, src?: string) {
  for (const [name, real] of [
    ['sessionStorage', realSession],
    ['localStorage', realLocal],
  ] as const) {
    Object.defineProperty(globalThis, name, { value: real, configurable: true })
  }
  document.body.innerHTML = '<div id="root"></div>'
  const listeners = new Map<string, Listener>()
  const location = { href: 'https://example.test/demo/', reload: () => void reloads.count++ }
  // The script under test, from our own index.html; `location` and `addEventListener` are this page's.
  new Function('location', 'addEventListener', script)(location, (type: string, fn: Listener) => listeners.set(type, fn))
  if (demo) {
    vi.resetModules()
    await import('./demo/reset')
  }
  const fail = listeners.get(src ? 'error' : 'vite:preloadError')
  if (!fail) throw new Error('no listener')
  return () => fail({ target: { tagName: 'SCRIPT', src }, preventDefault: () => {} })
}

const settle = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  realSession.clear()
  document.body.innerHTML = ''
})
afterEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', { value: realSession, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: realLocal, configurable: true })
})

it.each([
  ['the app', false],
  ['the demo, whose entry swaps and wipes sessionStorage', true],
])('%s: a chunk that always fails reloads twice, then says what happened', async (_, demo) => {
  const reloads = { count: 0 }
  for (let page = 0; page < 5 && !document.querySelector('[role=alert]'); page++) {
    const fail = await load(demo, reloads)
    fail()
    await settle()
  }
  expect(reloads.count).toBe(2)
  const alert = document.querySelector('[role=alert]')
  expect(alert?.textContent).toMatch(/couldn't load.*extension/)
  expect(alert?.querySelector('a')?.textContent).toBe('Reload')
  expect(document.getElementById('root')).toBeNull()
})

it('tries again a minute later', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    const reloads = { count: 0 }
    for (let page = 0; page < 3; page++) (await load(true, reloads))()
    await settle()
    expect(reloads.count).toBe(2)
    vi.setSystemTime(Date.now() + 61_000)
    ;(await load(true, reloads))()
    await settle()
    expect(reloads.count).toBe(3)
  } finally {
    vi.useRealTimers()
  }
})

it('a failing script of our own reloads at most twice; a third-party one (a blocked beacon) never', async () => {
  const reloads = { count: 0 }
  for (let page = 0; page < 3; page++) {
    ;(await load(true, reloads, 'https://static.cloudflareinsights.com/beacon.min.js'))()
    ;(await load(true, reloads, 'https://example.test/other/app.js'))() // same site, not under the app's base
  }
  await settle()
  expect(reloads.count).toBe(0)
  expect(document.querySelector('[role=alert]')).toBeNull()
  for (let page = 0; page < 4; page++) (await load(true, reloads, 'https://example.test/demo/assets/index-abc.js'))()
  await settle()
  expect(reloads.count).toBe(2)
  expect(document.querySelector('[role=alert]')).not.toBeNull()
})
