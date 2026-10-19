/** Where the hub is, and what a gate in front of it needs.
 *
 *  The copy the hub serves at /g2/ needs nothing: the hub is the page's own origin, and a gate in front
 *  already let the page through. A packaged build (.ehpk) runs from the phone and ships `config.json`,
 *  written at build time from MUXTOWER_G2_CONFIG and never committed:
 *  `{"hub": "https://hub.example.com", "gate": {"headers": {"X-Gate-Token": "…"}, "query": {"gate_token": "…"}}}`.
 *  Gate headers go on every HTTP request; the WebSocket cannot carry headers, so it gets `query`. */

export interface HubConfig {
  url: string
  gate: { headers: Record<string, string>; query: Record<string, string> }
}

const strings = (value: unknown): Record<string, string> =>
  value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : {}

export function parseHubConfig(raw: unknown, origin: string): HubConfig {
  const config = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const gate = config.gate && typeof config.gate === 'object' ? (config.gate as Record<string, unknown>) : {}
  const url = typeof config.hub === 'string' && config.hub ? config.hub : origin
  return { url: url.replace(/\/+$/, ''), gate: { headers: strings(gate.headers), query: strings(gate.query) } }
}

export async function loadHubConfig(): Promise<HubConfig> {
  let raw: unknown = null
  try {
    const res = await fetch('./config.json', { cache: 'no-store' })
    if (res.ok && res.headers.get('content-type')?.includes('json')) raw = await res.json()
  } catch {
    // No config: served by the hub itself.
  }
  return parseHubConfig(raw, location.origin)
}
