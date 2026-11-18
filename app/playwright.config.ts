import { defineConfig } from '@playwright/test'

// The terminal glyph suite (e2e/glyphs.spec.ts): fixtures drawn by the real TerminalView, checked for seams
// and drift in screenshots. Its page is served by Vite's dev server; the whole app's layout checks
// (e2e/layout.spec.ts) run on the demo (its made-up hub, `--mode demo`), served beside it.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4417' },
  webServer: [
    {
      command: 'npx vite --port 4417 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4417/e2e/glyphs.html',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npx vite --mode demo --port 4418 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4418/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
