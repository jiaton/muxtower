import { useEffect } from 'react'
import { create } from 'zustand'
import { markRejected, useDaemonsStore } from '@/lib/daemons/store'
import { daemonKey, queryClient } from '@/lib/query'
import { DaemonStream, type StreamStatus } from './stream'
import type { StreamSubscribe } from './types'

const streams = new Map<string, { stream: DaemonStream; signature: string }>()

export const useStreamStatus = create<{ status: Record<string, StreamStatus> }>(() => ({ status: {} }))
const setStatus = (id: string, status: StreamStatus) =>
  useStreamStatus.setState((s) => ({ status: { ...s.status, [id]: status } }))

/** Keeps one stream per paired daemon (mounted once, in the root layout). */
export function useDaemonStreams() {
  const daemons = useDaemonsStore((s) => s.daemons)
  useEffect(() => {
    const wanted = new Map(daemons.filter((d) => d.token && !d.rejected).map((d) => [d.id, d]))
    for (const [id, entry] of streams) {
      const daemon = wanted.get(id)
      if (!daemon || entry.signature !== `${daemon.url} ${daemon.token}`) {
        entry.stream.stop()
        streams.delete(id)
      }
    }
    for (const daemon of wanted.values()) {
      if (streams.has(daemon.id)) continue
      const stream = new DaemonStream(daemon, {
        onStatus: (status) => setStatus(daemon.id, status),
        onRejected: () => markRejected(daemon.id),
        onAuth: (method) => {
          if (daemon.streamAuth !== method) useDaemonsStore.getState().update(daemon.id, { streamAuth: method })
        },
        onFrame: (frame) => {
          if (frame.type === 'sessions') queryClient.setQueryData(daemonKey(daemon.id, 'sessions'), frame.sessions)
          else if (frame.type === 'screen')
            queryClient.setQueryData(daemonKey(daemon.id, 'screen', frame.session_id), frame.ansi)
        },
      })
      stream.subscribe({ type: 'subscribe', topic: 'sessions', history: 0 })
      stream.start()
      streams.set(daemon.id, { stream, signature: `${daemon.url} ${daemon.token}` })
    }
  }, [daemons])
}

/** Subscribes to a topic on a daemon's stream for as long as the calling component is mounted. */
export function useStreamSubscription(daemonId: string, message: StreamSubscribe | null) {
  const key = message ? JSON.stringify(message) : null
  useEffect(() => {
    if (!key) return
    return streams.get(daemonId)?.stream.subscribe(JSON.parse(key) as StreamSubscribe)
  }, [daemonId, key])
}
