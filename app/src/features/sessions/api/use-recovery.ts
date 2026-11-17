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

/** Starts an archived session again, on the machine it ran on, its conversation resumed, under its own id:
 *  it leaves Archived. `cwd`: another folder, when its own is gone. */
export function useResumeArchived(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (cwd?: string) =>
      unwrap(
        await client!.POST('/v1/sessions/{session_id}/resume', { params: { path: { session_id: sessionId } }, body: cwd ? { cwd } : {} }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'sessions') }),
  })
}
