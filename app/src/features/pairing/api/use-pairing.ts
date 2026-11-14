import { useMutation } from '@tanstack/react-query'
import { ApiError, createDaemonClient, unwrap } from '@/lib/api/client'
import { useDaemonsStore, usePairedDaemons } from '@/lib/daemons/store'
import type { PairTarget } from '../pair-link'
import { blockedBeforeTrying, whyUnreachable, withScheme } from '@/lib/reach'

export interface ClaimOutcome {
  target: PairTarget
  ok: boolean
  message: string
}

/** Redeems one-time codes and adds each daemon with its own new device token. */
export function useClaim() {
  return useMutation({
    mutationFn: async ({ targets, deviceName }: { targets: PairTarget[]; deviceName: string }) =>
      Promise.all(
        targets.map(async (target): Promise<ClaimOutcome> => {
          const url = withScheme(target.url)
          const blocked = blockedBeforeTrying(url, location)
          if (blocked) return { target, ok: false, message: blocked }
          try {
            const client = createDaemonClient({ url, token: null })
            const result = unwrap(await client.POST('/v1/pair/claim', { body: { code: target.code, device_name: deviceName } }))
            useDaemonsStore.getState().add({ name: target.name || result.daemon_name, url, token: result.token })
            return { target, ok: true, message: `paired as ${result.device_name}` }
          } catch (error) {
            if (error instanceof ApiError) return { target, ok: false, message: error.message }
            return { target, ok: false, message: whyUnreachable(url, error, location) } // no answer at all
          }
        }),
      ),
  })
}

/** Fresh one-time codes for every paired daemon, to hand to another device. */
export function useShareCodes() {
  const daemons = usePairedDaemons()
  return useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        daemons
          .filter((d) => !d.via)
          .map(async (d) => {
            const code = unwrap(await createDaemonClient(d).POST('/v1/pair/codes'))
            return { url: d.url, code: code.code, name: d.name, expiresAt: code.expires_at }
          }),
      )
      return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    },
  })
}
