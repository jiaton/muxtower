import { useMutation, useQueryClient } from '@tanstack/react-query'
import { check, createDaemonClient } from '@/lib/api/client'
import type { Session } from '@/lib/api/types'
import { useDaemonsStore } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

/** The owner's marks on a session (read, hidden) live on its daemon, so every device agrees. These
 *  mutations take any daemon (one call can mark a whole list) and show the change in the cached list at
 *  once; other devices hear it through the daemon's stream. */

function clientOf(daemonId: string) {
  const daemon = useDaemonsStore.getState().daemons.find((d) => d.id === daemonId)
  return daemon?.token && !daemon.rejected ? createDaemonClient({ url: daemon.url, token: daemon.token }) : null
}

function usePatch() {
  const queryClient = useQueryClient()
  return (daemonId: string, sessionId: string, patch: Partial<Session>) =>
    queryClient.setQueryData<Session[]>(daemonKey(daemonId, 'sessions'), (list) =>
      list?.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
    )
}

export interface MarkRead {
  daemonId: string
  sessionId: string
  /** False: unread, to come back to. */
  read: boolean
}

export function useMarkRead() {
  const patch = usePatch()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ daemonId, sessionId, read }: MarkRead) => {
      const client = clientOf(daemonId)
      if (client)
        check(await client.POST('/v1/sessions/{session_id}/read', { params: { path: { session_id: sessionId } }, body: { read } }))
    },
    onMutate: ({ daemonId, sessionId, read }) => {
      // Sent every half minute while a session is open: only touch the cache when it changes something.
      const list = queryClient.getQueryData<Session[]>(daemonKey(daemonId, 'sessions'))
      if (list?.some((s) => s.id === sessionId && s.unread === read)) patch(daemonId, sessionId, { unread: !read })
    },
  })
}

export interface HideSession {
  daemonId: string
  sessionId: string
  hidden: boolean
}

export function useHideSession() {
  const patch = usePatch()
  return useMutation({
    mutationFn: async ({ daemonId, sessionId, hidden }: HideSession) => {
      const client = clientOf(daemonId)
      if (client)
        check(await client.POST('/v1/sessions/{session_id}/hide', { params: { path: { session_id: sessionId } }, body: { hidden } }))
    },
    onMutate: ({ daemonId, sessionId, hidden }) => patch(daemonId, sessionId, { hidden }),
  })
}
