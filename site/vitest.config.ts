import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': fileURLToPath(new URL('../app/src', import.meta.url)),
    },
  },
  envPrefix: ['PUBLIC_', 'MUXTOWER_SITE_'],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,mjs}'],
    // A shared machine or a CI runner: 15 s per test (5 s timed whole files out under load), at most 3 workers.
    testTimeout: 15_000,
    maxWorkers: 3,
  },
})
