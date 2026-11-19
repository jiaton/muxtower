import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { check, unwrap } from '@/lib/api/client'
import type { Trigger, TriggerPatch, TriggerSpec } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

/** How many firings the log shows. */
export const LOG_SIZE = 50

const triggersKey = (daemonId: string) => daemonKey(daemonId, 'triggers')

/** The hub's triggers. Polled: a firing changes a row's last outcome, and no stream frame says so. */
export function useTriggers(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: triggersKey(daemonId),
    enabled: client !== null,
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => unwrap(await client!.GET('/v1/triggers')),
  })
}

/** The mode a start action's session runs in, per runtime (the hub's `triggers.start_mode`, held to its
 *  launch default unless agents may start sessions above it). Empty from a hub older than the setting. */
export function useStartModes(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    // Under the settings' key: a change there shows here at once.
    queryKey: daemonKey(daemonId, 'settings', 'trigger-start-modes'),
    enabled: client !== null,
    retry: false,
    queryFn: async () => {
      const result = await client!.GET('/v1/triggers/start-modes')
      if (result.response.status === 404) return [] // a hub from before it: its path reads as a trigger id
      return unwrap(result)
    },
  })
}

/** A trigger's last firings, newest first (at most `LOG_SIZE`), polled while shown. */
export function useFirings(daemonId: string, triggerId: string) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'triggers', triggerId, 'firings'),
    enabled: client !== null,
    refetchInterval: 15_000,
    queryFn: async () => {
      const firings = unwrap(await client!.GET('/v1/triggers/{trigger_id}/firings', { params: { path: { trigger_id: triggerId } } }))
      return [...firings].sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id).slice(0, LOG_SIZE)
    },
  })
}

function useRefresh(daemonId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: triggersKey(daemonId) })
}

/** Makes one; its secret comes back this once. */
export function useCreateTrigger(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const refresh = useRefresh(daemonId)
  return useMutation({
    mutationFn: async (spec: TriggerSpec) => unwrap(await client!.POST('/v1/triggers', { body: spec })),
    onSuccess: refresh,
  })
}

/** Changes one (pausing is `{enabled}`), shown changed at once. */
export function useUpdateTrigger(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  const refresh = useRefresh(daemonId)
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TriggerPatch }) =>
      unwrap(await client!.PATCH('/v1/triggers/{trigger_id}', { params: { path: { trigger_id: id } }, body: patch })),
    onSuccess: (trigger) =>
      queryClient.setQueryData<Trigger[]>(triggersKey(daemonId), (list) => list?.map((t) => (t.id === trigger.id ? trigger : t))),
    onSettled: refresh,
  })
}

export function useDeleteTrigger(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const refresh = useRefresh(daemonId)
  return useMutation({
    mutationFn: async (id: string) => check(await client!.DELETE('/v1/triggers/{trigger_id}', { params: { path: { trigger_id: id } } })),
    onSuccess: refresh,
  })
}

/** A new secret, shown this once; the old one stops working. */
export function useRotateSecret(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await client!.POST('/v1/triggers/{trigger_id}/secret', { params: { path: { trigger_id: id } } })).secret,
  })
}

/** Fires it with a sample payload, through all its rules and its action; the firing comes back, logged. */
export function useTestFire(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload, key }: { id: string; payload: unknown; key?: string | null }) =>
      unwrap(await client!.POST('/v1/triggers/{trigger_id}/test', { params: { path: { trigger_id: id } }, body: { payload, key } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: triggersKey(daemonId) }),
  })
}
