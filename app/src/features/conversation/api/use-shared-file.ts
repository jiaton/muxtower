import { useMutation, useQuery } from '@tanstack/react-query'
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
