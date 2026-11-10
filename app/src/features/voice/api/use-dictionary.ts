import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

export type Dictionary = components['schemas']['Dictionary']
export type DictionaryView = components['schemas']['DictionaryView']

/** The voice dictionary, kept on the hub (`/v1/asr/dictionary`): words for speech to text, corrections. */
export function useDictionary(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useQuery({
    queryKey: daemonKey(daemonId, 'asr-dictionary'),
    enabled: client !== null,
    queryFn: async () => unwrap(await client!.GET('/v1/asr/dictionary')),
  })
}

/** Saves it whole; the answer (with how many words fit) replaces what is cached. */
export function useSaveDictionary(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Dictionary) => unwrap(await client!.PUT('/v1/asr/dictionary', { body })),
    onSuccess: (saved) => queryClient.setQueryData(daemonKey(daemonId, 'asr-dictionary'), saved),
  })
}
