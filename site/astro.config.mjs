// The site is static: Astro renders every section to HTML at build time, and only the parts that move
// or take input (the demo, tabs, the FAQ, copy buttons) ship JavaScript, as React islands.
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [react()],
  // One page; the demo app is copied next to it after the build (`scripts/copy-demo.mjs`).
  build: { format: 'file' },
  vite: {
    plugins: [tailwindcss()],
    // Build-time settings (`src/config.ts`): nothing about a deployment is written in the source.
    envPrefix: ['PUBLIC_', 'MUXTOWER_SITE_'],
    // The design tokens live in the app (`app/src/styles/tokens.css`).
    server: { fs: { allow: ['..'] } },
  },
})
