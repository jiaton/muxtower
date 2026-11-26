import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { ApiError, unwrap } from '@/lib/api/client'
import type { SharedFile } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'
import { saveBlob } from '@/lib/save-blob'

type Client = NonNullable<ReturnType<typeof useDaemonClient>>

const fetchShared = async (client: Client, sessionId: string, fileId: string) =>
  unwrap(
    await client.GET('/v1/sessions/{session_id}/shared/{file_id}', {
      params: { path: { session_id: sessionId, file_id: fileId } },
      parseAs: 'blob',
    }),
  )

/** The daemon no longer has it: past its `expires_at`, or pruned. Said as "Expired". */
export const isGone = (error: unknown) => error instanceof ApiError && error.status === 404

/** A picture or video an agent shared (`ConversationItem.shared`), fetched with the daemon's token as a
 *  blob for <img> or <video>. Nothing is asked for without a `file` (one that expired, or not a picture
 *  or video). Kept for the page's life: a shared file never changes. */
export function useSharedFile(daemonId: string, sessionId: string, file: SharedFile | undefined) {
  const client = useDaemonClient(daemonId)
  return useQuery<Blob>({
    queryKey: daemonKey(daemonId, 'shared', sessionId, file?.id),
    enabled: client !== null && !!file,
    staleTime: Infinity,
    retry: false,
    queryFn: () => fetchShared(client!, sessionId, file!.id),
  })
}

const NONE: ReadonlySet<string> = new Set()

/** The shared files of a session the daemon answered 404 for (pruned before their `expires_at`), by id, as
 *  the query cache knows them once a thumbnail or large view asked: out of the gallery's count, and said as
 *  "Expired" with nothing more. */
export function useGoneShared(daemonId: string, sessionId: string): ReadonlySet<string> {
  const client = useQueryClient()
  const cache = client.getQueryCache()
  const snapshot = useCallback(() => {
    const prefix = daemonKey(daemonId, 'shared', sessionId)
    return cache
      .findAll({ queryKey: prefix })
      .filter((q) => isGone(q.state.error))
      .map((q) => String(q.queryKey[prefix.length]))
      .sort()
      .join('\n')
  }, [cache, daemonId, sessionId])
  const subscribe = useCallback((changed: () => void) => cache.subscribe(changed), [cache])
  const ids = useSyncExternalStore(subscribe, snapshot, snapshot)
  return useMemo(() => (ids ? new Set(ids.split('\n')) : NONE), [ids])
}

/** Saves a shared file as a download under its own name (`saveBlob`), never opened in the app. */
export function useDownloadShared(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({
    mutationFn: async (file: SharedFile) => {
      if (!client) throw new Error('This daemon is not paired here')
      saveBlob(await fetchShared(client, sessionId, file.id), file.name)
    },
  })
}
