import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { check, createDaemonClient, unwrap } from '@/lib/api/client'
import { usePairedDaemons } from '@/lib/daemons/store'
import type { Daemon } from '@/lib/daemons/types'
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

const LOGIN_CHECK_MS = 60_000

/** The paired daemons whose Claude login expired: their Remote Control sessions (Claude Desktop's, the
 *  Claude app's) stop updating until it is logged in again. Checked every minute while shown. */
export function useExpiredLogins(): Daemon[] {
  const daemons = usePairedDaemons()
  return useQueries({
    queries: daemons.map((d) => ({
      queryKey: daemonKey(d.id, 'me'),
      queryFn: async () => unwrap(await createDaemonClient(d).GET('/v1/me')),
      refetchInterval: LOGIN_CHECK_MS,
    })),
    combine: (results) => daemons.filter((_, i) => results[i].data?.claude_login_expired),
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
