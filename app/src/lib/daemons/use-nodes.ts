import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import { daemonKey } from '@/lib/query'
import { useDaemonClient } from './use-daemon-client'

/** The computers joined to a daemon as its nodes (their sessions are listed with its own), with
 *  whether each is connected and what can be started there. */
export function useNodes(daemonId: string, enabled = true) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'nodes'),
    enabled: enabled && client !== null,
    queryFn: async () => unwrap(await client!.GET('/v1/nodes')),
    refetchInterval: 15_000,
  })
}
