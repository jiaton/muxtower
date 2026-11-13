import { Lock, Monitor, Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { counts, groupsByDevice, sessionsOn } from '../model/lists'
import { DEVICES, deviceName, sessionById, type World } from '../model/world'
import { ApprovalCard } from './approval-card'
import { HubDownBanner } from './hub-down-banner'
import { AgentMark, StateMark } from './marks'
import { MessageItem } from './message'
import { SessionRow } from './session-row'
import { ink as appInk, look as appLook } from '@app/components/ui/intents'
import { device, deviceGroup } from '@/components/ui/intents'

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
    <div className={cn(device.window, 'flex flex-col overflow-hidden', className)}>
      <div className={`${device.titleBar} flex items-center gap-3 px-4 py-2.5`}>
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`${device.trafficLight} size-3`} />
          ))}
        </div>
        <div className={`${device.addressBar} mx-auto flex items-center gap-1.5 px-3 py-1`}>
          <Lock className="size-3" /> https://hub.example
        </div>
      </div>
      {world.hubDown && <HubDownBanner target="banner" ruled />}
      <div className="grid min-h-0 flex-1 grid-cols-[9.5rem_17rem_minmax(0,1fr)]">
        <nav aria-label="Demo sidebar" className={`${device.sidebar} flex flex-col gap-4 p-3`}>
          <div className="flex flex-col gap-0.5">
            {views.map(([label, count]) => (
              <div key={label} className={`${device.sidebarView} flex justify-between px-2 py-1`}>
                <span>{label}</span>
                <span className={appInk.quiet}>{count}</span>
              </div>
            ))}
          </div>
          <div data-demo="nav-devices" className="flex flex-col gap-0.5">
            <p className={`${appInk.eyebrow} px-2`}>Devices</p>
            {DEVICES.map((d) => (
              <div key={d.id} className={`${device.sidebarItem} flex items-center gap-2 px-2 py-1`}>
                {d.hub ? <Server className={`${appInk.quiet} size-3.5`} /> : <Monitor className={`${appInk.quiet} size-3.5`} />}
                <span className="flex-1">{d.name}</span>
                {d.hub && <Badge variant="secondary">hub</Badge>}
                <span className={appInk.quiet}>{sessionsOn(world, d.id).length}</span>
              </div>
            ))}
          </div>
        </nav>
        <div data-demo="list" className={`${appLook.rule.side} min-h-0 overflow-hidden`}>
          {groupsByDevice(world).map(({ device: machine, sessions }) => (
            <section
              key={machine.id}
              aria-label={machine.name}
              data-demo={`group-${machine.id}`}
              className={deviceGroup({ off: !!machine.hub && world.hubDown })}
            >
              <p className={`${device.groupHeader} px-3 py-1`}>
                {machine.name} · {machine.hub && world.hubDown ? 'unreachable' : machine.kind}
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
            <div className={`${appLook.rule.bottom} flex flex-col gap-0.5 px-4 py-2`}>
              <p className="flex items-center gap-2">
                <StateMark state={open.state} />
                <span className={appInk.strong}>{open.name}</span>
              </p>
              <p className={`${appInk.meta} flex items-center gap-1 truncate`}>
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
            <div className={`${appLook.rule.top} p-3`}>
              <p className={`${device.inputBox} ${appInk.quiet} px-3 py-2`}>Message the agent</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
