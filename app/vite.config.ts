/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const DEV_DAEMON = process.env.MUXTOWER_DEV_DAEMON ?? 'http://127.0.0.1:8731'
// Sub-path deployments (GitHub Pages: /<repo>/) set MUXTOWER_BASE; everything else is served at /.
const base = (process.env.MUXTOWER_BASE ?? '/').replace(/\/?$/, '/')

/** The demo build (`--mode demo`, `src/demo/`): the same app, started against a daemon simulated in the
 *  page, with no service worker and kept out of search results. */
const APP_URL = (process.env.MUXTOWER_DEMO_APP_URL ?? '').trim().replace(/"/g, '')

const demoEntry = (): Plugin => ({
  name: 'muxtower-demo-entry',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) =>
      html.replace('/src/main.tsx', '/src/demo/main.ts').replace(
        '<title>muxtower</title>',
        '<title>muxtower demo</title>\n    <meta name="robots" content="noindex" />' +
          // Where the demo's "Connect your own daemon" goes (`src/demo/cta.tsx`): the build names it, the
          // repository does not; without it the demo offers no way out.
          (APP_URL ? `\n    <meta name="muxtower-app-url" content="${APP_URL}" />` : ''),
      ),
  },
})

/** The muxtower this app is part of (the daemon's package version), to tell when a daemon runs a newer one. */
const APP_VERSION = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(new URL('../daemon/pyproject.toml', import.meta.url), 'utf8'))?.[1] ?? ''

// Live mode's keyword spotter (`@sherpaw/kws`) fetches its 12 MB WebAssembly from next to itself: pointed
// at the CDN instead (the version bundled, `features/voice/live/kws.ts`), it never becomes part of the app.
const KWS_VERSION = (JSON.parse(readFileSync('node_modules/@sherpaw/kws/package.json', 'utf8')) as { version: string }).version
function kwsWasmFromCdn(): Plugin {
  const local = 'new URL("./prebuilt/kws.wasm", import.meta.url)'
  const cdn = `new URL("https://cdn.jsdelivr.net/npm/@sherpaw/kws@${KWS_VERSION}/dist/prebuilt/kws.wasm")`
  return {
    name: 'kws-wasm-from-cdn',
    enforce: 'pre',
    transform: (code, id) => (id.includes('@sherpaw/kws') && code.includes(local) ? code.replaceAll(local, cdn) : null),
  }
}

export default defineConfig(({ mode }) => ({
  base,
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION) },
  build: mode === 'demo' ? { outDir: 'dist-demo' } : undefined,
  worker: { format: 'es', plugins: () => [kwsWasmFromCdn()] },
  optimizeDeps: { exclude: ['@sherpaw/kws'] },
  plugins: [
    kwsWasmFromCdn(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    mode === 'demo'
      ? demoEntry()
      : VitePWA({
          strategies: 'injectManifest',
          srcDir: 'src',
          filename: 'sw.ts',
          registerType: 'autoUpdate',
          injectRegister: 'auto',
          injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
          devOptions: { enabled: false },
          // Fetch the manifest with cookies: behind a sign-in gate, a manifest fetched without them is the
          // sign-in page, and the browser then offers no install.
          useCredentials: true,
          manifest: {
            name: 'muxtower',
            short_name: 'muxtower',
            description: 'Approve and drive coding agents from your phone.',
            display: 'standalone',
            // The app's light background (tokens.css --color-bg); index.html sets the bars per color scheme.
            background_color: '#f8f9fa',
            theme_color: '#f8f9fa',
            start_url: base,
            scope: base,
            // PNGs from `npm run icons`: Android installs the app (and shows its notifications as the app's,
            // not the browser's) only with raster icons.
            icons: [
              { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
        }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    // Same-origin in dev, exactly like the bundled UI served by `muxtower serve`: no CORS involved.
    proxy: {
      '/v1': { target: DEV_DAEMON, ws: true },
      '/config.json': DEV_DAEMON,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
