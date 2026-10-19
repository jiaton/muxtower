/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const DEV_DAEMON = process.env.MUXTOWER_DEV_DAEMON ?? 'http://127.0.0.1:8731'

export default defineConfig(({ command }) => ({
  // Relative, so the same build works at the hub's /g2/ and from inside an .ehpk package.
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    // Same-origin in dev, like the copy the hub serves at /g2/.
    proxy: { '/v1': { target: DEV_DAEMON, ws: true } },
  },
  // Dev server only: a device token for the simulator, whose panel cannot be typed into. Builds get ''.
  define: { __DEV_TOKEN__: JSON.stringify(command === 'serve' ? (process.env.MUXTOWER_G2_DEV_TOKEN ?? '') : '') },
  test: { environment: 'jsdom' },
}))
