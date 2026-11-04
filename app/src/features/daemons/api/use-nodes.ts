import { useMutation, useQueryClient } from '@tanstack/react-query'
import { check, unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** Forgets a node: its sessions leave the lists, and it can no longer link (it may join again). */
export function useRemoveNode(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => check(await client!.DELETE('/v1/nodes/{name}', { params: { path: { name } } })),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'nodes') }),
        queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'sessions') }),
      ]),
  })
}

/** A one-time pairing code, for a computer to join this daemon as a node (`muxtower pair --join`). */
export function useJoinCode(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({ mutationFn: async () => unwrap(await client!.POST('/v1/pair/codes')) })
}

/** The owner's address for reaching a node itself while the hub is down (null: the one it reports). */
export function useSetNodeAddress(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, url }: { name: string; url: string | null }) =>
      check(await client!.PATCH('/v1/nodes/{name}', { params: { path: { name } }, body: { direct_url: url } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'nodes') }),
  })
}
