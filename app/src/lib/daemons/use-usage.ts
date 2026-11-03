import { useQueries } from '@tanstack/react-query'
import { unwrap, createDaemonClient } from '@/lib/api/client'
import type { MachineUsage } from '@/lib/api/types'
import { daemonKey } from '@/lib/query'
import { usePairedDaemons } from './store'

/** What the daemon on each machine uses (each paired daemon and its nodes), by machine name in lower case:
 *  sampled there every few seconds, asked here every half minute. */
export function useMachineUsage(): Map<string, MachineUsage> {
  const daemons = usePairedDaemons()
  const results = useQueries({
    queries: daemons.map((daemon) => ({
      queryKey: daemonKey(daemon.id, 'usage'),
      queryFn: async () => unwrap(await createDaemonClient({ url: daemon.url, token: daemon.token! }).GET('/v1/usage')),
      retry: false, // an older daemon has none: asked again at the next interval
      refetchInterval: 30_000,
    })),
  })
  const byMachine = new Map<string, MachineUsage>()
  for (const result of results) for (const usage of result.data ?? []) byMachine.set(usage.machine.toLowerCase(), usage)
  return byMachine
}
