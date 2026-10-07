import { ChevronDown, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusDot } from '@/components/ui/status-dot'
import { ApiError } from '@/lib/api/client'
import { useStreamStatus } from '@/lib/api/streams'
import { cn } from '@/lib/cn'
import { useDaemonsStore } from '@/lib/daemons/store'
import type { Daemon } from '@/lib/daemons/types'
import { useDaemonMe } from '../api/use-daemon-me'
import { DevicesList } from './devices-list'

function useStatus(daemon: Daemon) {
  const me = useDaemonMe(daemon.id)
  const stream = useStreamStatus((s) => s.status[daemon.id])
  if (!daemon.token) return { tone: 'idle', text: 'Not paired' } as const
  if (me.isError) {
    const rejected = me.error instanceof ApiError && me.error.status === 401
    return { tone: 'error', text: rejected ? 'Token rejected: pair again' : 'Unreachable' } as const
  }
  if (me.isPending) return { tone: 'idle', text: 'Connecting…' } as const
  if (stream !== 'open') return { tone: 'warn', text: `Connected as ${me.data.token_name} · live updates off` } as const
  return { tone: 'ok', text: `Connected as ${me.data.token_name}` } as const
}

/** A daemon with its status. `actions` holds what other features add (pairing, push). */
export function DaemonCard({ daemon, actions }: { daemon: Daemon; actions?: ReactNode }) {
  const status = useStatus(daemon)
  const remove = useDaemonsStore((s) => s.remove)
  const [open, setOpen] = useState(!daemon.token)

  return (
    <Card className="flex flex-col gap-3 p-0">
      <button
        type="button"
        className="flex items-center gap-3 rounded-lg px-4 py-3 text-left hover:bg-surface-muted"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <StatusDot tone={status.tone} label={status.text} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{daemon.name}</p>
          <p className="truncate text-sm text-fg-muted">{status.text}</p>
        </div>
        <ChevronDown className={cn('size-4 text-fg-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div className="flex flex-col gap-4 border-t border-border px-4 pt-3 pb-4">
          <p className="font-mono text-xs break-all text-fg-muted">{daemon.url}</p>
          {actions}
          {daemon.token ? <DevicesList daemonId={daemon.id} /> : null}
          <Button variant="ghost" size="sm" className="self-start text-danger" onClick={() => remove(daemon.id)}>
            <Trash2 /> Forget on this device
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
