import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { check, unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** Confirms a daemon is reachable and accepts the stored token. */
export function useDaemonMe(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'me'),
    enabled: client !== null,
    queryFn: async () => unwrap(await client!.GET('/v1/me')),
  })
}

export function useDevices(daemonId: string, enabled: boolean) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'devices'),
    enabled: enabled && client !== null,
    queryFn: async () => unwrap(await client!.GET('/v1/devices')),
  })
}

export function useRevokeDevice(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => check(await client!.DELETE('/v1/devices/{name}', { params: { path: { name } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'devices') }),
  })
}
