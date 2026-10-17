import createClient, { type Client } from 'openapi-fetch'
import type { paths } from './schema'

export type DaemonClient = Client<paths>

export interface DaemonConnection {
  url: string
  token: string | null
}

/** One typed client per daemon. `url` is the daemon's origin (the bundled UI uses its own). */
export function createDaemonClient({ url, token }: DaemonConnection): DaemonClient {
  return createClient<paths>({
    baseUrl: url.replace(/\/+$/, ''),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

/** Present on every 401 the daemon itself sends; absent when a proxy or gate in front refused. */
export const DAEMON_AUTH_HEADER = 'x-muxtower-auth'

export class ApiError extends Error {
  readonly status: number
  /** The daemon answered (rather than something in front of it). */
  readonly fromDaemon: boolean

  constructor(status: number, detail: unknown, fromDaemon = true) {
    super(typeof detail === 'string' ? detail : `request failed (${status})`)
    this.status = status
    this.fromDaemon = fromDaemon
  }

  /** The daemon rejected this device's token: it was revoked. */
  get tokenRejected() {
    return this.status === 401 && this.fromDaemon
  }

  /** A proxy or sign-in gate in front of the daemon refused the request. */
  get blockedByGate() {
    return (this.status === 401 || this.status === 403) && !this.fromDaemon
  }
}

export function responseKind(res: Response): 'ok' | 'rejected' | 'blocked' | 'error' {
  if (res.ok) return 'ok'
  if (res.status === 401 && res.headers.has(DAEMON_AUTH_HEADER)) return 'rejected'
  if (res.status === 401 || res.status === 403) return 'blocked'
  return 'error'
}

/** Unwraps an openapi-fetch result so TanStack Query sees a thrown error on non-2xx. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok) {
    const kind = responseKind(result.response)
    const detail =
      kind === 'blocked'
        ? 'A sign-in page in front of this daemon refused the request.'
        : (result.error as { detail?: unknown } | undefined)?.detail
    throw new ApiError(result.response.status, detail, kind !== 'blocked')
  }
  return result.data as T
}

/** For 204 responses: throws on error, returns nothing. */
export function check(result: { error?: unknown; response: Response }): void {
  unwrap({ ...result, data: undefined })
}
