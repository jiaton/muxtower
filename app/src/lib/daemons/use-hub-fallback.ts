import { useEffect, useRef } from 'react'
import { ApiError, createDaemonClient, unwrap } from '@/lib/api/client'
import { useStreamStatus } from '@/lib/api/stream-status'
import { DOWN_AFTER_MS, PROBE_EVERY_MS, REFRESH_EVERY_MS, nodesBack, probeOf, useFallback, type Probe } from './fallback'
import { useDaemonsStore } from './store'
import type { Daemon } from './types'

const TICK_MS = 3_000

async function probe(hub: Daemon): Promise<Probe> {
  const client = createDaemonClient(hub)
  try {
    const res = await client.GET('/v1/me', { signal: AbortSignal.timeout(5_000) })
    unwrap(res)
    return 'up'
  } catch (error) {
    if (error instanceof ApiError) return probeOf({ status: error.status, gate: error.blockedByGate })
    return probeOf({ error })
  }
}

/** Mounted once (root layout): finds hubs that stop answering and lets the app reach their nodes directly,
 *  goes back to a hub once it answers with its nodes linked again, and while a hub answers, keeps the
 *  addresses and tokens it hands over fresh (`fallback.ts`). */
export function useHubFallback() {
  const status = useStreamStatus((s) => s.status)
  const statusRef = useRef(status)
  statusRef.current = status
  const memory = useRef(new Map<string, { closedSince?: number; probed?: number; refreshed?: number }>())

  useEffect(() => {
    let busy = false
    const tick = async () => {
      if (busy) return
      busy = true
      try {
        const { daemons, setDirect } = useDaemonsStore.getState()
        const { down, setDown } = useFallback.getState()
        const now = Date.now()
        for (const hub of daemons.filter((d) => !d.via && d.token && !d.rejected)) {
          const seen = memory.current.get(hub.id) ?? {}
          memory.current.set(hub.id, seen)
          const nodes = daemons.filter((d) => d.via === hub.id).map((d) => d.node ?? d.name)
          const open = statusRef.current[hub.id] === 'open'
          if (hub.id in down) {
            if (now - (seen.probed ?? 0) < PROBE_EVERY_MS) continue
            seen.probed = now
            if ((await probe(hub)) === 'down') continue
            const linked = await createDaemonClient(hub).GET('/v1/nodes').then(unwrap).catch(() => null)
            if (linked && nodesBack(linked, nodes)) setDown(hub.id, false)
            continue
          }
          if (open) {
            seen.closedSince = undefined
            if (now - (seen.refreshed ?? 0) >= REFRESH_EVERY_MS) {
              seen.refreshed = now
              const found = await createDaemonClient(hub).POST('/v1/nodes/direct').then(unwrap).catch(() => null)
              if (found) setDirect(hub.id, found) // an older hub has none to hand over: nothing changes
            }
            continue
          }
          seen.closedSince ??= now
          if (nodes.length && now - seen.closedSince >= DOWN_AFTER_MS && now - (seen.probed ?? 0) >= PROBE_EVERY_MS) {
            seen.probed = now
            if ((await probe(hub)) === 'down') setDown(hub.id, true)
          }
        }
      } finally {
        busy = false
      }
    }
    const timer = setInterval(() => void tick(), TICK_MS)
    void tick()
    return () => clearInterval(timer)
  }, [])
}
