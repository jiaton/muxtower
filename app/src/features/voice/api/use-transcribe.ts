import { useMutation } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'

/** Speech to text on the daemon (`/v1/asr`, the glasses' too): the recording goes as it is. */
export function useTranscribe(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({
    mutationFn: async (audio: Blob) =>
      unwrap(
        await client!.POST('/v1/asr', {
          body: audio as never,
          bodySerializer: (body: unknown) => body as Blob,
          headers: { 'Content-Type': audio.type.split(';')[0] },
        }),
      ).text.trim(),
  })
}
