import { useCallback } from 'react'
import { progressFetch } from '@/lib/api/progress-fetch'
import type { Attachment } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { uploadErrorText } from '../files'

/** Why an upload did not land: `refused` by the daemon (its words in `message`), or `network` (it never
 *  answered: worth a retry). */
export class UploadError extends Error {
  readonly kind: 'refused' | 'network'

  constructor(kind: 'refused' | 'network', message: string) {
    super(message)
    this.kind = kind
  }
}

/** Uploads one file for a message to this session (`POST …/attachments`): its bytes as the body, its name
 *  percent-encoded in a header, its type as the Content-Type. `onProgress` follows the bytes going out. */
export function useUploadAttachment(daemonId: string, sessionId: string) {
  const client = useDaemonClient(daemonId)
  return useCallback(
    async (file: File, onProgress: (sent: number, total: number) => void, signal?: AbortSignal): Promise<Attachment> => {
      if (!client) throw new UploadError('network', 'Not connected to this daemon')
      let result
      try {
        result = await client.POST('/v1/sessions/{session_id}/attachments', {
          params: { path: { session_id: sessionId }, header: { 'X-Muxtower-Filename': encodeURIComponent(file.name) } },
          body: file,
          bodySerializer: (body: unknown) => body as Blob,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          fetch: progressFetch(onProgress),
          signal,
        })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e
        throw new UploadError('network', 'Upload failed')
      }
      if (result.response.ok && result.data) return result.data
      // Something in between failed (a proxy, a restart): as good as no answer, worth trying again.
      if (result.response.status >= 500) throw new UploadError('network', 'Upload failed')
      throw new UploadError('refused', uploadErrorText(result.response.status, result.error ?? null))
    },
    [client, sessionId],
  )
}
