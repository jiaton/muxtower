import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import type { PlanUsage } from '@/lib/api/types'
import { usePairedDaemons } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

/** The daemon that keeps it: the first one this device talks to (the hub, which the machines report to). */
function useKeeper() {
  return usePairedDaemons()[0] ?? null
}

const keyOf = (id: string) => daemonKey(id, 'plan-usage')

/** The hub-wide setting that turns it on and off (hub only: nodes follow their hub). */
export const ENABLED_SETTING = 'plan_usage.enabled'

/** Every account the machines' CLIs are signed into, with its windows and machines, and whether the owner has
 *  it on. Read again every minute (the machines read theirs every 5). A hub too old to report it answers an
 *  error: nothing is shown. */
export function usePlanUsage() {
  const keeper = useKeeper()
  return useQuery({
    queryKey: keyOf(keeper?.id ?? '-'),
    enabled: keeper !== null,
    retry: false,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PlanUsage> => unwrap(await createDaemonClient(keeper!).GET('/v1/plan-usage')),
  })
}

/** Turns it on or off for every machine (the hub's setting), shown at once and put back if refused; the hub's
 *  settings page follows. */
export function useSetPlanUsageEnabled() {
  const keeper = useKeeper()
  const client = useQueryClient()
  const key = keyOf(keeper?.id ?? '-')
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!keeper) throw new Error('No daemon to keep the setting')
      return unwrap(await createDaemonClient(keeper).PATCH('/v1/settings', { params: { query: { node: null } }, body: { values: { [ENABLED_SETTING]: enabled } } }))
    },
    onMutate: async (enabled) => {
      await client.cancelQueries({ queryKey: key })
      const before = client.getQueryData<PlanUsage>(key)
      if (before) client.setQueryData<PlanUsage>(key, { ...before, enabled })
      return { before }
    },
    onError: (_error, _enabled, context) => {
      if (context?.before) client.setQueryData(key, context.before)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
      if (keeper) void client.invalidateQueries({ queryKey: daemonKey(keeper.id, 'settings') })
    },
  })
}
