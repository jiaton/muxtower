import { execFileSync } from 'node:child_process'
import { defineConfig } from '@playwright/test'

// The terminal glyph suite (e2e/glyphs.spec.ts): fixtures drawn by the real TerminalView, checked for seams
// and drift in screenshots. Its page is served by Vite's dev server; the whole app's layout checks
// (e2e/layout.spec.ts) run on the demo (its made-up hub, `--mode demo`), served beside it.
// MUXTOWER_E2E_PORT: the first of two ports (the harness, then the demo). Not set: two free ones are picked
// (once: the choice is passed on to the test workers through the environment). The servers are always this
// run's own, started and stopped by Playwright: never one another worktree or project runs on a fixed port
// (whose code would be tested instead, and which a fixed port would collide with).
process.env.MUXTOWER_E2E_PORT ||= execFileSync('node', ['scripts/free-port-pair.mjs'], { encoding: 'utf8' }).trim()
const base = Number(process.env.MUXTOWER_E2E_PORT)
const reuse = false
process.env.MUXTOWER_E2E_DEMO = `http://127.0.0.1:${base + 1}/`

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${base}` },
  webServer: [
    {
      command: `npx vite --port ${base} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${base}/e2e/glyphs.html`,
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      command: `npx vite --mode demo --port ${base + 1} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${base + 1}/`,
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
  ],
})
