export type StreamAuth = 'cookie' | 'subprotocol' | 'query'

export interface Daemon {
  id: string
  name: string
  url: string
  /** Null until the daemon has been paired (e.g. the bundled daemon before pairing). */
  token: string | null
  /** Came from the deployment's /config.json, not added on this device. */
  preset?: boolean
  /** The WebSocket auth method that last worked for this daemon. */
  streamAuth?: StreamAuth
  /** The daemon answered 401 to this token (revoked): stop polling and reconnecting until re-paired. */
  rejected?: boolean
  /** This browser's push subscription on the daemon, if notifications are on. */
  pushSubscriptionId?: string
  /** Push also says when an agent finishes a turn (default on). */
  pushDone?: boolean
}
