import { ArrowUp, ChevronLeft, Copy, Quote, Reply, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { groupsByDevice } from '../model/lists'
import { deviceName, sessionById, type World } from '../model/world'
import { ApprovalCard } from './approval-card'
import { HubDownBanner } from './hub-down-banner'
import { AgentMark, StateMark } from './marks'
import { MessageItem } from './message'
import { SessionRow } from './session-row'
import { ink as appInk, look as appLook } from '@app/components/ui/intents'
import { device, deviceGroup, look } from '@/components/ui/intents'

/** The same hub on a phone: the lock screen with its notifications, the session list, one session. */
export function Phone({ world, className }: { world: World; className?: string }) {
  return (
    <div className={cn(device.phone, 'p-2.5', className)}>
      <div className={`${device.screen} relative flex size-full flex-col overflow-hidden`}>
        <div className={`${device.statusBar} flex items-center justify-between px-6 pt-3 pb-1`}>
          <span>9:41</span>
          <span className={`${device.notch} h-5 w-20`} aria-hidden />
          <span className={appInk.quiet}>5G</span>
        </div>
        {world.hubDown && world.phone.screen !== 'lock' && <HubDownBanner target="phone-banner" />}
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
      <p className={`${device.lockClock} text-center`}>9:41</p>
      <p className={`${appInk.hint} mb-4 text-center`}>Tuesday, November 3</p>
      <AnimatePresence>
        {notification && (
          <motion.div
            key={notification.session}
            data-demo="phone-notification"
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className={`${device.notification} flex gap-2.5 p-3`}
          >
            <img src="/icon.svg" alt="" className={`${look.appIcon} mt-0.5 size-8`} />
            <div className={`${appInk.body} min-w-0`}>
              <p className="flex justify-between gap-2">
                <span className={appInk.emphasis}>{notification.title}</span>
                <span className={appInk.meta}>now</span>
              </p>
              <p className="line-clamp-3">{notification.body}</p>
              <p className={appInk.quiet}>{notification.where}</p>
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
      <p className={`${device.appTitle} px-4 pt-2 pb-2`}>All sessions</p>
      <div className="min-h-0 flex-1 overflow-hidden">
        {groupsByDevice(world).map(({ device: machine, sessions }) => (
          <section
            key={machine.id}
            aria-label={machine.name}
            data-demo={`phone-group-${machine.id}`}
            className={deviceGroup({ off: !!machine.hub && world.hubDown })}
          >
            <p className={`${device.groupHeader} px-3 py-0.5`}>
              {machine.name}
              {machine.hub && world.hubDown && ' · unreachable'}
            </p>
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
      className={`${device.popover} flex gap-1 self-start p-1`}
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
      <div className={`${appLook.rule.bottom} flex items-center gap-2 px-3 py-2`}>
        <ChevronLeft className={`${appInk.quiet} size-4`} />
        <StateMark state={session.state} />
        <div className="min-w-0">
          <p className={`${device.sessionTitle} truncate`}>{session.name}</p>
          <p className={`${appInk.meta} flex items-center gap-1 truncate`}>
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
      <div data-demo="phone-composer" className={`${appLook.rule.top} flex flex-col gap-1.5 p-2.5`}>
        {quote && (
          <p className={`${device.quoteChip} flex items-center gap-1.5 px-2 py-1.5`}>
            <Quote className={`${appInk.quiet} size-3 shrink-0`} />
            <span className="flex-1 truncate">{quote}</span>
            <X className={`${appInk.quiet} size-3 shrink-0`} />
          </p>
        )}
        <div className="flex items-end gap-2">
          <p className={`${device.inputBox} min-h-9 flex-1 px-3 py-2`}>
            {draft || <span className={appInk.quiet}>Message the agent</span>}
            {draft && <span className={`${device.caret} ml-px inline-block h-4 w-px align-middle`} />}
          </p>
          <Button size="icon" round data-demo="phone-send" tabIndex={-1} aria-label="Send">
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  )
}
