import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { check, unwrap } from '@/lib/api/client'
import { useDaemonsStore } from '@/lib/daemons/store'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'

export type PushSupport = 'ok' | 'insecure' | 'unsupported'

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return 'insecure'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

const swUrl = () => (import.meta.env.DEV ? '/dev-sw.js?dev-sw' : `${import.meta.env.BASE_URL}sw.js`)
const scopeFor = (daemonId: string) => `${import.meta.env.BASE_URL}push/${daemonId}/`

const toUint8 = (base64url: string) => {
  const bin = atob(base64url.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function registration(daemonId: string) {
  return navigator.serviceWorker.getRegistration(new URL(scopeFor(daemonId), location.origin).href)
}

type Client = NonNullable<ReturnType<typeof useDaemonClient>>

/** Registers (or updates: the daemon keys it by endpoint) this browser's subscription on the daemon. */
async function save(client: Client, daemonId: string, sub: PushSubscription, done: boolean) {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const saved = unwrap(
    await client.POST('/v1/push/subscriptions', {
      body: { endpoint: json.endpoint, keys: json.keys, client_ref: daemonId, done, muted: [] },
    }),
  )
  useDaemonsStore.getState().update(daemonId, { pushSubscriptionId: saved.id, pushDone: done })
}

/** Whether this browser currently receives pushes from this daemon. */
export function usePushEnabled(daemonId: string) {
  return useQuery({
    queryKey: daemonKey(daemonId, 'push'),
    enabled: pushSupport() === 'ok',
    queryFn: async () => {
      const reg = await registration(daemonId)
      return Boolean(reg && (await reg.pushManager.getSubscription()))
    },
  })
}

export function useTogglePush(daemonId: string) {
  const client = useDaemonClient(daemonId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (enable: boolean) => {
      const daemon = useDaemonsStore.getState().daemons.find((d) => d.id === daemonId)
      if (!enable) {
        const reg = await registration(daemonId)
        await reg?.pushManager.getSubscription().then((s) => s?.unsubscribe())
        await reg?.unregister()
        if (daemon?.pushSubscriptionId) {
          await client!
            .DELETE('/v1/push/subscriptions/{subscription_id}', {
              params: { path: { subscription_id: daemon.pushSubscriptionId } },
            })
            .then(check)
            .catch(() => undefined) // already gone on the daemon: fine
          useDaemonsStore.getState().update(daemonId, { pushSubscriptionId: undefined })
        }
        return false
      }
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this site.')
      const { public_key } = unwrap(await client!.GET('/v1/push/key'))
      const reg = await navigator.serviceWorker.register(swUrl(), {
        scope: scopeFor(daemonId),
        type: import.meta.env.DEV ? 'module' : 'classic',
      })
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(public_key) })
      await save(client!, daemonId, sub, daemon?.pushDone ?? true)
      return true
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'push') }),
  })
}

/** Whether pushes also say when an agent finishes a turn. Saved on the daemon when notifications are on,
 *  and remembered for when they are turned on. */
export function useSetPushDone(daemonId: string) {
  const client = useDaemonClient(daemonId)
  return useMutation({
    mutationFn: async (done: boolean) => {
      const sub = await (await registration(daemonId))?.pushManager.getSubscription()
      if (sub && client) await save(client, daemonId, sub, done)
      else useDaemonsStore.getState().update(daemonId, { pushDone: done })
    },
  })
}
