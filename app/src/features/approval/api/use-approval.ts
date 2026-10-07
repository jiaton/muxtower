import { useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

export function useApprove(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (option?: string) =>
      unwrap(
        await client!.POST('/v1/sessions/{session_id}/approve', {
          params: { path: { session_id: sessionId } },
          body: { option: option ?? null },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'sessions') }),
  })
}

export function useDeny(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      unwrap(await client!.POST('/v1/sessions/{session_id}/deny', { params: { path: { session_id: sessionId } } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'sessions') }),
  })
}
