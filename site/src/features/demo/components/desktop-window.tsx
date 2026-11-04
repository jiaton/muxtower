import { Lock, Monitor, Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { counts, groupsByDevice, sessionsOn } from '../model/lists'
import { DEVICES, deviceName, sessionById, type World } from '../model/world'
import { ApprovalCard } from './approval-card'
import { AgentMark, StateMark } from './marks'
import { MessageItem } from './message'
import { SessionRow } from './session-row'

/** The hub's web app in a browser window, as it looks on a computer: views and machines, the sessions
 *  by machine, and the open session's conversation. */
export function DesktopWindow({ world, className }: { world: World; className?: string }) {
  const open = sessionById(world, world.open)
  const n = counts(world)
  const views: [string, number][] = [
    ['All sessions', n.all],
    ['Needs you', n.needs],
    ['Unread', n.unread],
    ['Working', n.working],
  ]
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl bg-background shadow-window', className)}>
      <div className="flex items-center gap-3 border-b border-border bg-muted px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-3 rounded-full bg-border" />
          ))}
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-background px-3 py-1 font-mono text-xs text-fg-muted">
          <Lock className="size-3" /> https://hub.example
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[9.5rem_17rem_minmax(0,1fr)]">
        <nav aria-label="Demo sidebar" className="flex flex-col gap-4 border-r border-border bg-surface p-3 text-sm">
          <div className="flex flex-col gap-0.5">
            {views.map(([label, count]) => (
              <div key={label} className="flex justify-between rounded-md px-2 py-1 first:bg-muted">
                <span>{label}</span>
                <span className="text-fg-muted">{count}</span>
              </div>
            ))}
          </div>
          <div data-demo="nav-devices" className="flex flex-col gap-0.5">
            <p className="px-2 text-xs font-medium tracking-wide text-fg-muted uppercase">Devices</p>
            {DEVICES.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-md px-2 py-1">
                {d.hub ? <Server className="size-3.5 text-fg-muted" /> : <Monitor className="size-3.5 text-fg-muted" />}
                <span className="flex-1">{d.name}</span>
                {d.hub && <Badge variant="secondary">hub</Badge>}
                <span className="text-fg-muted">{sessionsOn(world, d.id).length}</span>
              </div>
            ))}
          </div>
        </nav>
        <div data-demo="list" className="min-h-0 overflow-hidden border-r border-border">
          {groupsByDevice(world).map(({ device, sessions }) => (
            <section key={device.id} aria-label={device.name} data-demo={`group-${device.id}`}>
              <p className="bg-muted px-3 py-1 text-xs font-medium text-fg-muted">
                {device.name} · {device.kind}
              </p>
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  target={`row-${s.id}`}
                  flash={world.flash === `row-${s.id}`}
                  selected={s.id === world.open}
                />
              ))}
            </section>
          ))}
        </div>
        {open && (
          <div data-demo="pane" className="flex min-h-0 flex-col">
            <div className="flex flex-col gap-0.5 border-b border-border px-4 py-2">
              <p className="flex items-center gap-2">
                <StateMark state={open.state} />
                <span className="font-medium">{open.name}</span>
              </p>
              <p className="flex items-center gap-1 truncate text-xs text-fg-muted">
                <AgentMark agent={open.agent} />
                {[open.role, open.agent === 'claude' ? 'Claude Code' : 'Codex', deviceName(open.device), open.folder, open.source]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {open.pending && <ApprovalCard pending={open.pending} target="pane-approval" />}
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden p-4">
              {(world.messages[open.id] ?? []).map((m) => (
                <MessageItem key={m.id} message={m} target={`pane-msg-${m.id}`} />
              ))}
            </div>
            <div className="border-t border-border p-3">
              <p className="rounded-lg border border-border px-3 py-2 text-sm text-fg-muted">Message the agent</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
