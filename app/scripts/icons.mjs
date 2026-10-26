// Renders the PNG icons in public/ from their SVG sources: Android needs raster icons to install the
// PWA (and to attribute its notifications to it rather than to the browser), iOS ignores an SVG
// apple-touch-icon, and a notification's badge must be a raster alpha mask. Run after changing an icon:
// `npm run icons`, then commit the PNGs.
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const here = (path) => new URL(path, import.meta.url)
const ICONS = [
  ['../public/icon.svg', 'icon-192.png', 192],
  ['../public/icon.svg', 'icon-512.png', 512],
  ['icons/maskable.svg', 'icon-maskable-512.png', 512],
  ['icons/maskable.svg', 'apple-touch-icon.png', 180], // iOS rounds the corners itself
  ['icons/badge.svg', 'badge-96.png', 96],
]

for (const [source, name, size] of ICONS) {
  const png = new Resvg(readFileSync(here(source)), { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(here(`../public/${name}`), png)
  console.log(`public/${name} (${size}px)`)
}
