import { useQueries } from '@tanstack/react-query'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import type { TeamTask } from '@/lib/api/types'
import { daemonKey } from '@/lib/query'
import type { SessionEntry } from '../model/facets'

/** The last task each of these sessions was sent, by session id: one request per daemon, while `enabled`
 *  (a team card shown). A daemon too old to say gives none. */
export function useLatestTasks(members: SessionEntry[], enabled: boolean): Map<string, TeamTask> {
  const byDaemon = new Map<string, SessionEntry[]>()
  for (const m of members) byDaemon.set(m.daemon.id, [...(byDaemon.get(m.daemon.id) ?? []), m])
  const groups = [...byDaemon.values()]
  return useQueries({
    queries: groups.map((list) => {
      const ids = list.map((m) => m.session.id).sort()
      return {
        queryKey: daemonKey(list[0].daemon.id, 'latest-tasks', ids.join(',')),
        enabled,
        retry: false,
        staleTime: 15_000,
        queryFn: async () => unwrap(await createDaemonClient(list[0].daemon).GET('/v1/tasks/latest', { params: { query: { to: ids } } })),
      }
    }),
    combine: (results) => new Map(results.flatMap((r) => Object.entries(r.data ?? {}))),
  })
}
