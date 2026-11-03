import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import type { Session, UpdateTeam } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

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

/** The tasks teammates sent it, and it sent them, newest first. */
export function useSessionTasks(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'tasks', sessionId),
    queryFn: async () =>
      unwrap(await client!.GET('/v1/sessions/{session_id}/tasks', { params: { path: { session_id: sessionId }, query: { limit: 20 } } })),
    enabled: Boolean(client),
  })
}
