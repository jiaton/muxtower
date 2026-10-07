import { Banner } from '@/components/ui/banner'
import { Switch } from '@/components/ui/switch'
import { pushSupport, usePushEnabled, useTogglePush } from '../api/use-push'

const REASONS = {
  insecure: 'Notifications need HTTPS. Put the daemon behind Tailscale serve, a Cloudflare Tunnel or Caddy.',
  unsupported: 'This browser cannot receive push notifications. On iPhone, add the app to the Home Screen first.',
} as const

export function PushToggle({ daemonId }: { daemonId: string }) {
  const support = pushSupport()
  const enabled = usePushEnabled(daemonId)
  const toggle = useTogglePush(daemonId)
  const id = `push-${daemonId}`

  if (support !== 'ok') return <p className="text-sm text-fg-muted">{REASONS[support]}</p>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm">
          Notify this device when an agent needs you
        </label>
        <Switch
          id={id}
          checked={enabled.data ?? false}
          disabled={enabled.isPending || toggle.isPending}
          onCheckedChange={(on) => toggle.mutate(on)}
        />
      </div>
      {toggle.isError ? <Banner tone="error">{toggle.error.message}</Banner> : null}
    </div>
  )
}
