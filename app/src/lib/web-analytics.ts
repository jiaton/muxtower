/**
 * Cloudflare Web Analytics for the public hosted app only: the build gets a beacon token from
 * `MUXTOWER_APP_ANALYTICS_TOKEN` (`make public-app`, from CI); without one there is no beacon at all.
 *
 * The app's URLs carry daemon and session ids (`/d/<id>/s/<id>`), and the beacon reports the page's URL
 * and referrer. So, before the beacon loads, every report it makes is rewritten here on its way out:
 * same-origin URLs become their route pattern (`/d/:daemon/s/:session`, no query, no hash), other URLs
 * their origin, and any id seen in this page's address is cut out of every other field. A report this
 * cannot read is dropped, never sent as it was. SPA tracking is off: one page view per load.
 * An ad blocker stopping the beacon changes nothing (index.html's recover script ignores other origins).
 */

const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js'
const RUM = /\/cdn-cgi\/rum(?:[?#]|$)/

/** The words of the app's routes (src/routes); any other segment is an id. */
const WORDS = new Set(['d', 's', 'daemons', 'settings', 'pair'])
const NAMED: Record<string, string> = { d: ':daemon', s: ':session', daemons: ':daemon' }

/** A path's route pattern: `/d/abc/s/xyz` → `/d/:daemon/s/:session`; the query and hash dropped. */
export function routePattern(path: string, base = '/'): string {
  const bare = path.replace(/[?#].*$/, '')
  const rest = bare.startsWith(base) ? bare.slice(base.length) : bare.replace(/^\//, '')
  const segments = rest.split('/')
  const out = segments.map((s, i) => (s === '' || WORDS.has(s) ? s : (NAMED[segments[i - 1]] ?? ':id')))
  return base + out.join('/')
}

/** Segments and query values of this page's addresses that are not route words: what must not leave. */
export function secretsOf(hrefs: string[]): string[] {
  const found = new Set<string>()
  for (const href of hrefs) {
    let url: URL
    try {
      url = new URL(href)
    } catch {
      continue
    }
    for (const s of url.pathname.split('/')) if (s.length >= 3 && !WORDS.has(s)) found.add(decodeURIComponent(s))
    for (const v of url.searchParams.values()) if (v.length >= 3) found.add(v)
    if (url.hash.length > 3) found.add(url.hash.slice(1))
  }
  return [...found].sort((a, b) => b.length - a.length)
}

/** One string of a report, made safe: a URL to its pattern or origin, then any secret cut out. */
function scrubString(value: string, origin: string, base: string, secrets: string[]): string {
  let out = value
  if (/^https?:\/\//.test(value)) {
    try {
      const url = new URL(value)
      out = url.origin === origin ? origin + routePattern(url.pathname, base) : url.origin + '/'
    } catch {
      out = ''
    }
  } else if (value.startsWith('/')) out = routePattern(value, base)
  for (const s of secrets) out = out.split(s).join(':id')
  return out
}

/** A report (the beacon's JSON body), every string in it made safe. */
export function scrubReport(body: string, origin: string, base: string, secrets: string[]): string {
  const walk = (v: unknown): unknown =>
    typeof v === 'string'
      ? scrubString(v, origin, base, secrets)
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
          : v
  return JSON.stringify(walk(JSON.parse(body))) // throws on what is not JSON: the caller drops it
}

const isRum = (url: string | URL | undefined) => !!url && RUM.test(String(url))

/** Routes every report the beacon can send (sendBeacon, XHR, fetch) through `scrubReport`. */
export function installReportFilter(win: Window & typeof globalThis = window) {
  const origin = win.location.origin
  const base = import.meta.env.BASE_URL
  const landing = win.location.href
  const scrub = (body: string) => scrubReport(body, origin, base, secretsOf([landing, win.location.href, win.document.referrer]))
  const tryScrub = (body: string) => {
    try {
      return scrub(body)
    } catch {
      return null
    }
  }

  const beacon = win.navigator.sendBeacon?.bind(win.navigator)
  if (beacon)
    win.navigator.sendBeacon = (url, data) => {
      if (!isRum(url)) return beacon(url, data)
      if (typeof data === 'string') {
        const safe = tryScrub(data)
        return safe !== null && beacon(url, safe)
      }
      if (data instanceof Blob) {
        void data.text().then((text) => {
          const safe = tryScrub(text)
          if (safe !== null) beacon(url, new Blob([safe], { type: 'application/json' }))
        })
        return true
      }
      return false
    }

  const urls = new WeakMap<XMLHttpRequest, string>()
  const open = win.XMLHttpRequest.prototype.open
  const send = win.XMLHttpRequest.prototype.send as (this: XMLHttpRequest, body?: unknown) => void
  win.XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    urls.set(this, String(args[1]))
    return (open as (...a: unknown[]) => void).apply(this, args)
  } as typeof open
  win.XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    if (!isRum(urls.get(this))) return send.call(this, body)
    const safe = typeof body === 'string' ? tryScrub(body) : null
    if (safe !== null) send.call(this, safe)
  }

  const fetch = win.fetch.bind(win)
  win.fetch = (input, init) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
    if (!isRum(url)) return fetch(input, init)
    const safe = typeof init?.body === 'string' ? tryScrub(init.body) : null
    return safe === null ? Promise.resolve(new Response(null, { status: 204 })) : fetch(input, { ...init, body: safe })
  }
}

/** Starts the beacon when the build has a token: the filter first, then Cloudflare's script. */
export function startWebAnalytics(token: string | undefined, doc: Document = document) {
  if (!token) return
  installReportFilter()
  const script = doc.createElement('script')
  script.defer = true
  script.src = BEACON
  script.setAttribute('data-cf-beacon', JSON.stringify({ token, spa: false }))
  doc.head.append(script)
}
