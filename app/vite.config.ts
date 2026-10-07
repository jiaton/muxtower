/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const DEV_DAEMON = process.env.MUXTOWER_DEV_DAEMON ?? 'http://127.0.0.1:8731'
// Sub-path deployments (GitHub Pages: /<repo>/) set MUXTOWER_BASE; everything else is served at /.
const base = (process.env.MUXTOWER_BASE ?? '/').replace(/\/?$/, '/')

export default defineConfig({
  base,
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
      devOptions: { enabled: false },
      manifest: {
        name: 'muxtower',
        short_name: 'muxtower',
        description: 'Approve and drive coding agents from your phone.',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
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
})
