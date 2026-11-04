import { useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** Starts sessions a restart interrupted again (on their own machine: a hub passes a node's on), each
 *  resuming its conversation under its own id; nothing is sent to them. */
export function useRecoverSessions(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sessionIds: string[]) => unwrap(await client!.POST('/v1/recovery', { body: { session_ids: sessionIds } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'sessions') }),
  })
}
