/** Route patterns of the app's addresses, for anything that leaves the device (no daemon or session ids).
 *  No DOM: the service worker uses it too. */

/** The words of the app's routes (src/routes), and of the other paths on its origin (the glasses page,
 *  the push registrations' scopes); any other segment is an id. */
export const WORDS = new Set(['d', 's', 'daemons', 'settings', 'pair', 'g2', 'push'])
const NAMED: Record<string, string> = { d: ':daemon', s: ':session', daemons: ':daemon' }

/** A path's route pattern: `/d/abc/s/xyz` → `/d/:daemon/s/:session`; the query and hash dropped. */
export function routePattern(path: string, base = '/'): string {
  const bare = path.replace(/[?#].*$/, '')
  const rest = bare.startsWith(base) ? bare.slice(base.length) : bare.replace(/^\//, '')
  const segments = rest.split('/')
  const out = segments.map((s, i) => (s === '' || WORDS.has(s) ? s : (NAMED[segments[i - 1]] ?? ':id')))
  return base + out.join('/')
}
