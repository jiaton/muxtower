import { ArrowUp, ChevronLeft, Copy, Quote, Reply, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { groupsByDevice } from '../model/lists'
import { deviceName, sessionById, type World } from '../model/world'
import { ApprovalCard } from './approval-card'
import { AgentMark, StateMark } from './marks'
import { MessageItem } from './message'
import { SessionRow } from './session-row'

/** The same hub on a phone: the lock screen with its notifications, the session list, one session. */
export function Phone({ world, className }: { world: World; className?: string }) {
  return (
    <div className={cn('rounded-device bg-device-frame p-2.5 shadow-device', className)}>
      <div className="relative flex size-full flex-col overflow-hidden rounded-screen bg-background">
        <div className="flex items-center justify-between px-6 pt-3 pb-1 text-xs font-semibold">
          <span>9:41</span>
          <span className="h-5 w-20 rounded-full bg-device-frame" aria-hidden />
          <span className="text-fg-muted">5G</span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${world.phone.screen}:${world.phone.session}`}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {world.phone.screen === 'lock' && <LockScreen world={world} />}
            {world.phone.screen === 'list' && <ListScreen world={world} />}
            {world.phone.screen === 'session' && <SessionScreen world={world} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function LockScreen({ world }: { world: World }) {
  const { notification } = world.phone
  return (
    <div className="flex flex-1 flex-col gap-3 px-3 pt-10">
      <p className="text-center text-6xl font-light tracking-tight">9:41</p>
      <p className="mb-4 text-center text-sm text-fg-muted">Tuesday, November 3</p>
      <AnimatePresence>
        {notification && (
          <motion.div
            key={notification.session}
            data-demo="phone-notification"
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex gap-2.5 rounded-lg bg-muted p-3"
          >
            <img src="/icon.svg" alt="" className="mt-0.5 size-8 rounded-md" />
            <div className="min-w-0 text-sm">
              <p className="flex justify-between gap-2">
                <span className="font-semibold">{notification.title}</span>
                <span className="text-xs text-fg-muted">now</span>
              </p>
              <p className="line-clamp-3">{notification.body}</p>
              <p className="text-fg-muted">{notification.where}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ListScreen({ world }: { world: World }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-4 pt-2 pb-2 text-lg font-semibold">All sessions</p>
      <div className="min-h-0 flex-1 overflow-hidden">
        {groupsByDevice(world).map(({ device, sessions }) => (
          <section key={device.id} aria-label={device.name} data-demo={`phone-group-${device.id}`}>
            <p className="bg-muted px-3 py-0.5 text-xs font-medium text-fg-muted">{device.name}</p>
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} target={`phone-row-${s.id}`} flash={world.flash === `row-${s.id}`} compact />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

/** What selecting part of a reply offers, as the app does. */
function SelectionBar() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex gap-1 self-start rounded-md border border-border bg-popover p-1 shadow-card"
    >
      <Button size="xs" variant="ghost" tabIndex={-1}>
        <Copy /> Copy
      </Button>
      <Button size="xs" variant="ghost" data-demo="phone-reply" tabIndex={-1}>
        <Reply /> Reply
      </Button>
    </motion.div>
  )
}

function SessionScreen({ world }: { world: World }) {
  const session = sessionById(world, world.phone.session)
  const { quote, draft, selection } = world.phone
  if (!session) return null
  return (
    <div data-demo="phone-screen" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ChevronLeft className="size-4 text-fg-muted" />
        <StateMark state={session.state} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{session.name}</p>
          <p className="flex items-center gap-1 truncate text-xs text-fg-muted">
            <AgentMark agent={session.agent} /> {deviceName(session.device)} · {session.folder}
          </p>
        </div>
      </div>
      {session.pending && <ApprovalCard pending={session.pending} target="phone-approval" />}
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-hidden p-3">
        {(world.messages[session.id] ?? []).map((m) => (
          <div key={m.id} className="flex flex-col gap-1.5">
            <MessageItem message={m} target={`phone-msg-${m.id}`} selected={selection?.message === m.id ? selection.text : undefined} />
            {selection?.message === m.id && <SelectionBar />}
          </div>
        ))}
      </div>
      <div data-demo="phone-composer" className="flex flex-col gap-1.5 border-t border-border p-2.5">
        {quote && (
          <p className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-xs">
            <Quote className="size-3 shrink-0 text-fg-muted" />
            <span className="flex-1 truncate">{quote}</span>
            <X className="size-3 shrink-0 text-fg-muted" />
          </p>
        )}
        <div className="flex items-end gap-2">
          <p className="min-h-9 flex-1 rounded-lg border border-border px-3 py-2 text-sm">
            {draft || <span className="text-fg-muted">Message the agent</span>}
            {draft && <span className="ml-px inline-block h-4 w-px animate-pulse bg-fg align-middle" />}
          </p>
          <Button size="icon" data-demo="phone-send" tabIndex={-1} aria-label="Send" className="rounded-full">
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  )
}
