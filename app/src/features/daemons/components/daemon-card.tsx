import { Link } from '@tanstack/react-router'
import { ChevronDown, Settings2, Trash2 } from 'lucide-react'
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
import { NodesList } from './nodes-list'
import { UsageList } from './usage-list'

function useStatus(daemon: Daemon) {
  const me = useDaemonMe(daemon.id)
  const stream = useStreamStatus((s) => s.status[daemon.id])
  if (!daemon.token) return { tone: 'idle', text: 'Not paired' } as const
  if (daemon.rejected) return { tone: 'error', text: 'This device was removed: pair again' } as const
  if (stream === 'blocked' || (me.error instanceof ApiError && me.error.blockedByGate))
    return { tone: 'warn', text: 'Behind a sign-in page: open the daemon and sign in' } as const
  if (me.isError) return { tone: 'error', text: 'Unreachable' } as const
  if (me.isPending) return { tone: 'idle', text: 'Connecting…' } as const
  if (stream !== 'open') return { tone: 'warn', text: `Connected as ${me.data.token_name} · live updates off` } as const
  return { tone: 'ok', text: `Connected as ${me.data.token_name}` } as const
}

/** A daemon with its status. `actions` holds what other features add (pairing, push). */
export function DaemonCard({ daemon, actions }: { daemon: Daemon; actions?: ReactNode }) {
  const status = useStatus(daemon)
  const remove = useDaemonsStore((s) => s.remove)
  const [open, setOpen] = useState(!daemon.token || !!daemon.rejected)

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
          {daemon.token && !daemon.rejected ? <DevicesList daemonId={daemon.id} /> : null}
          {daemon.token && !daemon.rejected ? <NodesList daemonId={daemon.id} url={daemon.url} /> : null}
          {daemon.token && !daemon.rejected ? <UsageList daemonId={daemon.id} /> : null}
          {daemon.token && !daemon.rejected ? (
            <Button asChild variant="ghost" size="sm" className="self-start">
              <Link to="/daemons/$daemonId/settings" params={{ daemonId: daemon.id }}>
                <Settings2 /> Settings
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="self-start text-danger" onClick={() => remove(daemon.id)}>
            <Trash2 /> Forget on this device
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
