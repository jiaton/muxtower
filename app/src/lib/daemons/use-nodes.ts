import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
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

const NO_NAMES: string[] = []

/** The names of a daemon's connected nodes: where it can start a session now, besides its own machine
 *  (the new-session dialog offers no other). */
export function useNodeNames(daemonId: string): string[] {
  const nodes = useNodes(daemonId, daemonId !== '').data
  return useMemo(() => nodes?.filter((n) => n.online).map((n) => n.name) ?? NO_NAMES, [nodes])
}
