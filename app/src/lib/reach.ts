/**
 * Why a daemon could not be reached, in words the owner can act on: a browser refuses some requests before
 * they leave (an https page cannot call plain http, except this machine's own address), a public page
 * reaching a private address may be refused too (Chrome's Private Network Access), and otherwise the address,
 * the port or what the daemon listens on (`host`) is wrong. Never just "cannot reach".
 */

export interface Page {
  protocol: string
  hostname: string
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** The address as tried: typed without a scheme (`192.168.1.20:8731`), it is `http://…`. */
export function withScheme(input: string): string {
  const url = input.trim().replace(/\/+$/, '')
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`
}

/** A private, link-local or CGNAT (tailnet) address, or a `.local` name. */
export function isPrivate(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (h.endsWith('.local') || h.endsWith('.ts.net')) return true
  const [a, b] = h.split('.').map(Number)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h))
    return a === 10 || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b < 128)
  return /^f[cd][0-9a-f]{2}:/.test(h) || h.startsWith('fe80:')
}

/** What stops the browser before it even sends the request, if anything. */
export function blockedBeforeTrying(url: string, page: Page): string | null {
  const target = new URL(withScheme(url))
  if (page.protocol === 'https:' && target.protocol === 'http:' && !LOCAL.has(target.hostname))
    return (
      `This page is HTTPS, so the browser blocks a plain-HTTP daemon (${target.origin}). Use the daemon's https ` +
      `address (\`muxtower expose tailscale\` on it), or open the daemon's own page at ${target.origin} and pair there.`
    )
  return null
}

/** Why a request to `url` got no answer at all (`Failed to fetch`). */
export function whyUnreachable(url: string, error: unknown, page: Page): string {
  const blocked = blockedBeforeTrying(url, page)
  if (blocked) return blocked
  const target = new URL(withScheme(url))
  const detail = error instanceof Error && error.message !== 'Failed to fetch' ? ` (${error.message})` : ''
  const privateNote =
    isPrivate(target.hostname) && !isPrivate(page.hostname) && !LOCAL.has(page.hostname)
      ? ' This page is on the internet and the daemon on a private network: the browser may refuse that (private network access); open the daemon’s own page, or give it a public https address.'
      : ''
  return (
    `No answer from ${target.origin}${detail}.${privateNote} Check the address and port, and that the daemon runs ` +
    'and listens beyond its own machine (`host` in its config: 127.0.0.1 is that machine only).'
  )
}
