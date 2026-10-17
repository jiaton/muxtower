/** Pairing links carry everything after `#`, which browsers never send to a server.
 *  One daemon:  /pair#u=<daemon url>&c=<code>     (what `muxtower pair --url …` prints)
 *  This daemon: /pair#c=<code>                     (the page's own origin is the daemon: its bundled UI)
 *  Several:     /pair#d=<base64url JSON [{u,c,n}]> (what "Add another device" shows) */
export interface PairTarget {
  url: string
  code: string
  name?: string
}

const toBase64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

const fromBase64Url = (text: string) => {
  const bin = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function parsePairHash(hash: string, ownOrigin?: string): PairTarget[] {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const many = params.get('d')
  if (many) {
    try {
      const list = JSON.parse(fromBase64Url(many)) as Array<{ u?: unknown; c?: unknown; n?: unknown }>
      return list
        .filter((t) => typeof t.u === 'string' && typeof t.c === 'string')
        .map((t) => ({ url: t.u as string, code: t.c as string, name: typeof t.n === 'string' ? t.n : undefined }))
    } catch {
      return []
    }
  }
  const url = params.get('u') ?? ownOrigin
  const code = params.get('c')
  return url && code ? [{ url, code }] : []
}

/** Accepts a full link (from any app origin) or just its hash. */
export function parsePairLink(text: string): PairTarget[] {
  const trimmed = text.trim()
  const hashAt = trimmed.indexOf('#')
  return hashAt >= 0 ? parsePairHash(trimmed.slice(hashAt)) : []
}

export function buildPairLink(appBase: string, targets: PairTarget[]): string {
  const payload = targets.map((t) => ({ u: t.url, c: t.code, n: t.name }))
  return `${appBase.replace(/\/+$/, '')}/pair#d=${toBase64Url(JSON.stringify(payload))}`
}

export function guessDeviceName(userAgent = navigator.userAgent): string {
  const device = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Windows/.test(userAgent)
            ? 'Windows'
            : 'Linux'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : 'Safari'
  return `${device} ${browser}`
}
