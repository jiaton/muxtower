/** How long a download's URL is kept: the browser has taken it long before (Safari needs a moment). */
const KEEP_MS = 30_000

/**
 * Saves a file fetched with the daemon's token as a download named `name`, never opened. The blob is
 * re-typed `application/octet-stream` first: a blob URL has the app's own origin, so one of a type the
 * browser renders (HTML, SVG) would run as the app if it were ever opened rather than saved.
 */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), KEEP_MS)
}
