import createClient, { type Client } from 'openapi-fetch'
import type { HubConfig } from './config'
import type { paths } from './schema'

export type HubClient = Client<paths>

export function createHubClient(config: HubConfig, token: string | null): HubClient {
  return createClient<paths>({
    baseUrl: config.url,
    headers: { ...config.gate.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
}

/** Present on every 401 the hub itself sends; absent when a gate in front refused. */
const HUB_AUTH_HEADER = 'x-muxtower-auth'

export class HubError extends Error {
  readonly status: number
  readonly fromHub: boolean

  constructor(status: number, message: string, fromHub: boolean) {
    super(message)
    this.status = status
    this.fromHub = fromHub
  }

  /** The hub rejected this device's token (revoked). */
  get tokenRejected() {
    return this.status === 401 && this.fromHub
  }
}

export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  const { response } = result
  if (response.ok) return result.data as T
  const fromHub = response.status !== 401 || response.headers.has(HUB_AUTH_HEADER)
  const detail = (result.error as { detail?: unknown } | undefined)?.detail
  const message = !fromHub
    ? 'A sign-in gate in front of the hub refused the request.'
    : typeof detail === 'string'
      ? detail
      : `Request failed (${response.status})`
  throw new HubError(response.status, message, fromHub)
}
