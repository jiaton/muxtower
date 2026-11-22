import { useQueries, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { pollInterval, type StreamStatus } from '@/lib/api/stream-status'
import { useStreamStatus } from '@/lib/api/streams'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import type { Session } from '@/lib/api/types'
import { usePairedDaemons } from '@/lib/daemons/store'
import type { Daemon } from '@/lib/daemons/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** Polls only while the daemon's stream is down (slowly when a gate blocks it); otherwise the stream
 *  keeps the cache fresh. */
function sessionsQuery(daemon: Daemon, status: StreamStatus | undefined) {
  return {
    queryKey: daemonKey(daemon.id, 'sessions'),
    queryFn: async () => unwrap(await createDaemonClient(daemon).GET('/v1/sessions')),
    refetchInterval: pollInterval(status),
  }
}

export function useDaemonSessions(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const status = useStreamStatus((s) => s.status[daemonId])
  return useQuery({
    queryKey: daemonKey(daemonId, 'sessions'),
    enabled: client !== null,
    queryFn: async () => unwrap(await client!.GET('/v1/sessions')),
    refetchInterval: pollInterval(status),
  })
}

export function useSession(daemonId: string, sessionId: string) {
  const query = useDaemonSessions(daemonId)
  return { ...query, session: query.data?.find((s) => s.id === sessionId) }
}

export interface DaemonSessions {
  daemon: Daemon
  sessions: Session[]
  error: Error | null
  isPending: boolean
  updatedAt: number // when the sessions were last fetched or streamed (epoch ms; 0 before)
}

/** Every paired daemon's sessions, for the Inbox. One failing daemon never hides the others. The same
 *  array until a daemon or its sessions change (`combine` kept while the daemons are), so what callers derive
 *  from it (facets, filters, counts) is not worked out again on every render of each. */
export function useAllSessions(): DaemonSessions[] {
  const daemons = usePairedDaemons()
  const status = useStreamStatus((s) => s.status)
  const combine = useCallback(
    (results: { data?: Session[]; error: Error | null; isPending: boolean; dataUpdatedAt: number }[]) =>
      results.map((r, i) => ({
        daemon: daemons[i]!,
        sessions: r.data ?? NO_SESSIONS,
        error: r.error,
        isPending: r.isPending,
        updatedAt: r.dataUpdatedAt,
      })),
    [daemons],
  )
  return useQueries({ queries: daemons.map((d) => sessionsQuery(d, status[d.id])), combine })
}
const NO_SESSIONS: Session[] = []
