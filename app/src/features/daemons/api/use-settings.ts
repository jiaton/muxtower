import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import type { MachineSettings } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** A machine's feature settings: the daemon's own, or (`node`) a node's, which its hub asks over the link. */
export function useMachineSettings(daemonId: string, node?: string) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'settings', node ?? ''),
    enabled: client !== null,
    queryFn: async () => unwrap(await client!.GET('/v1/settings', { params: { query: { node: node ?? null } } })),
    retry: false,
  })
}

/** Changes some (null: back to the default); the page shows what the daemon answers. */
export function useChangeSettings(daemonId: string, node?: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) =>
      unwrap(await client!.PATCH('/v1/settings', { params: { query: { node: node ?? null } }, body: { values } })),
    onSuccess: (data: MachineSettings) => queryClient.setQueryData(daemonKey(daemonId, 'settings', node ?? ''), data),
  })
}
