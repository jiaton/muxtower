import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** Other names a session went by, latest first: asked for only while its rename dialog is open. A daemon
 *  too old to keep them answers 404, and the dialog offers what the session says of itself instead. */
export function useSessionNames(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'names', sessionId),
    enabled: client !== null,
    retry: false,
    queryFn: async () =>
      unwrap(await client!.GET('/v1/sessions/{session_id}/names', { params: { path: { session_id: sessionId } } })),
  })
}
