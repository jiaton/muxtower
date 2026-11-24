import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import type { Session, UpdateTeam } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'
import { useDaemonSessions } from './use-sessions'

/** A session's role and project in its team (only what is given changes); the list shows it at once. */
export function useUpdateTeam(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: UpdateTeam) =>
      unwrap(await client!.PUT('/v1/sessions/{session_id}/team', { params: { path: { session_id: sessionId } }, body })),
    onSuccess: (session) =>
      queryClient.setQueryData<Session[]>(daemonKey(daemonId, 'sessions'), (list) => list?.map((s) => (s.id === session.id ? session : s))),
  })
}

/** A project's team at work in the last `hours` (GET /v1/projects/{project}/activity), for its Team dialog;
 *  asked again whenever the sessions change (a task sent or delivered says so), and every half minute. */
export function useProjectActivity(daemonId: string, project: string | null | undefined, hours: number) {
  const client = useDaemonClient(daemonId)
  const sessionsAt = useDaemonSessions(daemonId).dataUpdatedAt // the list's own query (a fetchless one warned)
  return useQuery({
    queryKey: daemonKey(daemonId, 'activity', project, hours, sessionsAt),
    queryFn: async () =>
      unwrap(await client!.GET('/v1/projects/{project}/activity', { params: { path: { project: project! }, query: { hours } } })),
    enabled: Boolean(client && project),
    placeholderData: (previous) => previous, // no flash between two answers
    refetchInterval: 30_000,
  })
}
