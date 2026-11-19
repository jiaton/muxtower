/** Where a script on the hub's network sends a trigger's events, and how. */

export const LAN_PLACEHOLDER = 'http://<hub-LAN-address>:8731'

/** A private network's address (or this computer's): one a trigger can be fired at. */
function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan')) return true
  const ip = host.split('.').map(Number)
  if (ip.length !== 4 || ip.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = ip as [number, number, number, number]
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

/**
 * The hub's address on its own network: the one this browser reaches it at, when that is one; else a
 * placeholder to fill in (the daemon does not say its LAN address, and its public hostname does not take
 * triggers yet).
 */
export function lanBase(daemonUrl: string): string {
  try {
    const url = new URL(daemonUrl)
    if (isPrivateHost(url.hostname)) return url.origin
  } catch {
    // not a URL: the placeholder
  }
  return LAN_PLACEHOLDER
}

export const fireUrl = (base: string, triggerId: string) => `${base}/v1/triggers/${encodeURIComponent(triggerId)}/fire`

export function curlExample(base: string, triggerId: string, secret: string): string {
  return [
    `curl -X POST '${fireUrl(base, triggerId)}' \\`,
    `  -H 'X-Muxtower-Trigger-Secret: ${secret}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"title": "Example event"}'`,
  ].join('\n')
}

export const cliExample = (name: string) => `echo '{"title": "Example event"}' | muxtower trigger ${name} --data -`
