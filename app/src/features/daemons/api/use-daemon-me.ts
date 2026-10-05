import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import { daemonKey } from '@/lib/query'
import { useDaemonClient } from './use-daemon-client'

/** Confirms a daemon is reachable and accepts the stored token. */
export function useDaemonMe(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'me'),
    enabled: client !== null,
    queryFn: async () => unwrap(await client!.GET('/v1/me')),
  })
}
