/**
 * Direct fallback: while a hub does not answer (its machine restarting), the app talks to the computers
 * joined to it directly, as daemons of their own (`Daemon.via`), at the https address and with the device
 * token each node made for this device through the hub while it answered. When the hub answers again and
 * its nodes are linked to it, the app goes back to it. Not a second hub: nothing is synced; team changes
 * and push notifications need the hub.
 */
import { create } from 'zustand'
import type { Daemon } from './types'

/** Not answering for this long, with the stream down, makes a hub down. */
export const DOWN_AFTER_MS = 8_000
/** How often a hub that is down is asked again. */
export const PROBE_EVERY_MS = 15_000
/** How often a hub that answers is asked for fresh tokens and addresses. */
export const REFRESH_EVERY_MS = 30 * 60_000

interface FallbackState {
  /** Hubs found down, since when (ms). */
  down: Record<string, number>
  setDown: (hubId: string, down: boolean) => void
}

export const useFallback = create<FallbackState>()((set) => ({
  down: {},
  setDown: (hubId, down) =>
    set((s) => {
      if (down === hubId in s.down) return s
      const next = { ...s.down }
      if (down) next[hubId] = Date.now()
      else delete next[hubId]
      return { down: next }
    }),
}))

/** Whether the app talks to this daemon now: any daemon of its own, a node directly only while its hub is down. */
export const isActive = (daemon: Daemon, down: Record<string, number>) => !daemon.via || daemon.via in down

/** What a probe of a hub says: a 401 or a sign-in gate is an answer (the hub is up, this device is not let
 *  in), not a hub that is down. */
export type Probe = 'up' | 'down' | 'answers'

export function probeOf(result: { status?: number; gate?: boolean; error?: unknown }): Probe {
  if (result.error !== undefined) return 'down' // no answer at all: refused, timed out, DNS
  if (result.gate || result.status === 401 || result.status === 403) return 'answers'
  if (result.status !== undefined && result.status >= 500) return 'down' // its proxy, with nothing behind it
  return 'up'
}

/** Whether a hub that answers again has its nodes back: then the app goes back to it. */
export const nodesBack = (nodes: { name: string; online: boolean }[], direct: string[]) =>
  direct.every((name) => nodes.find((n) => n.name === name)?.online ?? true)

export interface DirectNode {
  node: string
  url: string
  token: string
}

/** The hub's direct daemons after the hub handed over `found`: one per node (`<hub>~<node>`), https only,
 *  those of nodes it no longer lists gone; everything else in `daemons` as it was. */
export function withDirect(daemons: Daemon[], hub: Daemon, found: DirectNode[]): Daemon[] {
  const mine = (d: Daemon) => d.via === hub.id
  const kept = daemons.filter((d) => !mine(d))
  const direct = found
    .filter((f) => f.url.startsWith('https://'))
    .map((f): Daemon => {
      const before = daemons.find((d) => mine(d) && d.node === f.node)
      return {
        ...before,
        id: `${hub.id}~${f.node}`,
        name: f.node,
        url: f.url.replace(/\/+$/, ''),
        token: f.token,
        via: hub.id,
        node: f.node,
        rejected: false,
      }
    })
  return [...kept, ...direct]
}

/** Where a session listed by a hub as `<node>~<id>` is while that hub is down, and back: the same session. */
export function directPlace(daemons: Daemon[], daemonId: string, sessionId: string, down: Record<string, number>) {
  const daemon = daemons.find((d) => d.id === daemonId)
  if (!daemon) return null
  if (daemon.via && !(daemon.via in down)) return { daemonId: daemon.via, sessionId: `${daemon.node}~${sessionId}` }
  if (!daemon.via && daemonId in down) {
    const [node, ...rest] = sessionId.split('~')
    const direct = rest.length ? daemons.find((d) => d.via === daemonId && d.node === node) : undefined
    if (direct) return { daemonId: direct.id, sessionId: rest.join('~') }
  }
  return null
}
