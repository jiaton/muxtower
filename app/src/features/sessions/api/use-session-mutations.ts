import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { check, unwrap } from '@/lib/api/client'
import type { Session } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

function usePatchCache(daemonId: string) {
  const queryClient = useQueryClient()
  return (session: Session) =>
    queryClient.setQueryData<Session[]>(daemonKey(daemonId, 'sessions'), (list) => list?.map((s) => (s.id === session.id ? session : s)))
}

export function useRuntimes(daemonId: string, enabled = true) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'runtimes'),
    enabled: enabled && client !== null,
    queryFn: async () => unwrap(await client!.GET('/v1/runtimes')),
    staleTime: 60_000,
  })
}

export function useCreateSession(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      runtime: string
      cwd: string | null
      name?: string | null
      headless?: boolean
      node?: string | null
      permission_mode?: string | null
      args?: string[]
    }) => unwrap(await client!.POST('/v1/sessions', { body: { ...body, headless: body.headless ?? false, args: body.args ?? [] } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'sessions') }),
  })
}

export function useUpdateSession(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  const patchCache = usePatchCache(daemonId)
  return useMutation({
    mutationFn: async (body: { name?: string; auto_approve?: boolean }) =>
      unwrap(await client!.PATCH('/v1/sessions/{session_id}', { params: { path: { session_id: sessionId } }, body })),
    onSuccess: patchCache,
  })
}

export function useTerminateSession(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => check(await client!.DELETE('/v1/sessions/{session_id}', { params: { path: { session_id: sessionId } } })),
    onSuccess: () =>
      queryClient.setQueryData<Session[]>(daemonKey(daemonId, 'sessions'), (list) => list?.filter((s) => s.id !== sessionId)),
  })
}

/** Ends the session and keeps it to read under Archived; the list reloads to show it there. */
export function useArchiveSession(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      check(await client!.POST('/v1/sessions/{session_id}/archive', { params: { path: { session_id: sessionId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'sessions') }),
  })
}
