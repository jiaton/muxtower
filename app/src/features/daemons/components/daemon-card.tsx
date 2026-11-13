import { Link } from '@tanstack/react-router'
import { MoreHorizontal, Settings2, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StatusDot } from '@/components/ui/status-dot'
import { ApiError } from '@/lib/api/client'
import { useStreamStatus } from '@/lib/api/streams'

import { useDaemonsStore } from '@/lib/daemons/store'
import type { Daemon } from '@/lib/daemons/types'
import { useDaemonMe } from '../api/use-daemon-me'
import { DevicesList } from './devices-list'
import { MachinesList } from './nodes-list'
import { UsageList } from './usage-list'

import { Chevron } from '@/components/ui/indicators'
import { ink, look } from '@/components/ui/intents'

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

/** A daemon: its header (status, name, address; its Settings, and forgetting it in ⋯) always shows;
 *  opened, what other features add (`actions`: pairing, push), then its machines (itself and the
 *  computers joined to it), the devices paired with it, and what each machine uses. */
export function DaemonCard({ daemon, actions }: { daemon: Daemon; actions?: ReactNode }) {
  const status = useStatus(daemon)
  const remove = useDaemonsStore((s) => s.remove)
  const [open, setOpen] = useState(!daemon.token || !!daemon.rejected)
  const paired = !!daemon.token && !daemon.rejected

  return (
    <Card className="flex flex-col p-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 pr-3 pl-1">
        <Button
          variant="plain"
          className={`${look.hoverRow} flex min-w-60 flex-1 items-center gap-3 px-3 py-1.5 text-left`}
          aria-expanded={open}
          aria-label={`${daemon.name}: ${open ? 'hide' : 'show'} its machines and devices`}
          onClick={() => setOpen(!open)}
        >
          <StatusDot tone={status.tone} label={status.text} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`${ink.strong} truncate`}>{daemon.name}</span>
            <span className={`${ink.hint} truncate`}>{status.text}</span>
            <span className={`${ink.codeMeta} truncate`}>{daemon.url}</span>
          </span>
          <Chevron vertical quiet open={open} className="size-4" />
        </Button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {paired ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/daemons/$daemonId/settings" params={{ daemonId: daemon.id }} aria-label={`Settings of ${daemon.name}`}>
                <Settings2 /> Settings
              </Link>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More for ${daemon.name}`} title="More">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem tone="danger" onSelect={() => remove(daemon.id)}>
                <Trash2 /> Forget on this device
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {open ? (
        <div className={`${look.rule.top} flex flex-col gap-4 px-4 pt-4 pb-4`}>
          {actions}
          {paired ? <MachinesList daemonId={daemon.id} url={daemon.url} /> : null}
          {paired ? <DevicesList daemonId={daemon.id} /> : null}
          {paired ? <UsageList daemonId={daemon.id} /> : null}
        </div>
      ) : null}
    </Card>
  )
}
