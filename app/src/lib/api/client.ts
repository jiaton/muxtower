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

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `request failed (${status})`)
    this.status = status
  }
}

/** Unwraps an openapi-fetch result so TanStack Query sees a thrown error on non-2xx. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok) {
    const detail = (result.error as { detail?: unknown } | undefined)?.detail
    throw new ApiError(result.response.status, detail)
  }
  return result.data as T
}

/** For 204 responses: throws on error, returns nothing. */
export function check(result: { error?: unknown; response: Response }): void {
  unwrap({ ...result, data: undefined })
}
