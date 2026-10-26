import { useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import type { Session } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

export interface Placement {
  machine?: string | null
  folder?: string | null
}

/** Where the owner says a session runs (empty fields: as its source says); the list shows it there at once. */
export function usePlaceSession(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Placement) =>
      unwrap(await client!.PUT('/v1/sessions/{session_id}/placement', { params: { path: { session_id: sessionId } }, body })),
    onSuccess: (session) =>
      queryClient.setQueryData<Session[]>(daemonKey(daemonId, 'sessions'), (list) => list?.map((s) => (s.id === session.id ? session : s))),
  })
}

/** Reads the session's whole log for the folder its tool calls ran in: a suggestion, kept only once the
 *  owner saves it (`usePlaceSession`). */
export function useDetectPlacement(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({
    mutationFn: async () =>
      unwrap(await client!.POST('/v1/sessions/{session_id}/placement/detect', { params: { path: { session_id: sessionId } } })),
  })
}
