import type { Daemon, StreamAuth } from '@/lib/daemons/types'
import { responseKind } from './client'

const OPEN_TIMEOUT_MS = 8000
/** Not `token`: gates in front of a daemon treat an unknown `?token=` as a password guess. */
export const QUERY_TOKEN = 'access_token'

export type Refused = 'rejected' | 'blocked'

/** One /v1/stream socket opened with one auth method: open, refused (the token revoked, or a sign-in gate
 *  in front, said by the cookie request), or null when it did not open. */
export async function openSocket(daemon: Daemon, method: StreamAuth): Promise<WebSocket | Refused | null> {
  const { url, token } = daemon
  if (!token) return null
  const base = `${url.replace(/^http/, 'ws')}/v1/stream`
  let ws: WebSocket
  try {
    if (method === 'cookie') {
      const res = await fetch(`${url}/v1/stream/cookie`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
      })
      const kind = responseKind(res)
      if (kind === 'rejected' || kind === 'blocked') return kind
      if (!res.ok) return null
      ws = new WebSocket(base, ['muxtower'])
    } else if (method === 'subprotocol') {
      ws = new WebSocket(base, ['muxtower', `bearer.${token}`])
    } else {
      ws = new WebSocket(`${base}?${QUERY_TOKEN}=${encodeURIComponent(token)}`)
    }
  } catch {
    return null
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      ws.close()
      resolve(null)
    }, OPEN_TIMEOUT_MS)
    ws.onopen = () => {
      clearTimeout(timeout)
      resolve(ws)
    }
    ws.onclose = () => {
      clearTimeout(timeout)
      resolve(null)
    }
  })
}
