import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusDot } from '@/components/ui/status-dot'
import { ApiError } from '@/lib/api/client'
import { useDaemonMe } from '../api/use-daemon-me'
import { useDaemonsStore } from '../store'
import type { Daemon } from '../types'

function statusOf(daemon: Daemon, me: ReturnType<typeof useDaemonMe>) {
  if (!daemon.token) return { tone: 'idle', text: 'Not paired' } as const
  if (me.isPending) return { tone: 'idle', text: 'Connecting…' } as const
  if (me.isError) {
    const rejected = me.error instanceof ApiError && me.error.status === 401
    return { tone: 'error', text: rejected ? 'Token rejected' : 'Unreachable' } as const
  }
  return { tone: 'ok', text: `Connected as ${me.data.token_name}` } as const
}

export function DaemonCard({ daemon }: { daemon: Daemon }) {
  const me = useDaemonMe(daemon.id)
  const remove = useDaemonsStore((s) => s.remove)
  const status = statusOf(daemon, me)

  return (
    <Card className="flex items-center gap-3">
      <StatusDot tone={status.tone} label={status.text} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{daemon.name}</p>
        <p className="truncate text-sm text-fg-muted">
          {daemon.url} · {status.text}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => remove(daemon.id)} aria-label={`Remove ${daemon.name}`}>
        Remove
      </Button>
    </Card>
  )
}
