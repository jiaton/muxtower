/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const DEV_DAEMON = process.env.MUXTOWER_DEV_DAEMON ?? 'http://127.0.0.1:8731'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
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
