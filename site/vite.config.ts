import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Build-time settings (`src/config.ts`): nothing about a deployment is written in the source.
  envPrefix: ['VITE_', 'MUXTOWER_SITE_'],
  // The design tokens and the shipped font live in the app (`app/src/styles/tokens.css`).
  server: { fs: { allow: ['..'] } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false },
})
