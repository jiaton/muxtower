/** Resolves a color token (e.g. `--color-terminal-bg`) to `rgb(...)` for libraries such as xterm.js that
 *  cannot parse modern CSS colors. Keeps every color defined in tokens.css. */
export function tokenColor(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx || !value) return value
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}
