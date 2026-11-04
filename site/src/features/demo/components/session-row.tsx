import { CornerDownRight, MessageSquareText } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { metaOf, type Session } from '../model/world'
import { AgentMark, StateMark } from './marks'

interface Props {
  session: Session
  /** `data-demo` id the cursor aims at. */
  target: string
  flash: boolean
  selected?: boolean
  compact?: boolean
}

const enter = { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 } }

/** One session in a list, as the app lists it: state, name, role · machine · repository · source, and
 *  what it said last. A fork sits under its parent, indented; a side chat folds into one line. */
export function SessionRow({ session, target, flash, selected, compact }: Props) {
  if (session.sideChat) return <SideChatLine target={target} flash={flash} unread={session.state === 'unread'} />
  return (
    <motion.div
      {...enter}
      data-demo={target}
      className={cn(
        'relative flex gap-2.5 border-b border-border px-3 py-2 transition-colors duration-500',
        session.parent && 'pl-8',
        selected && 'bg-muted',
        flash && 'bg-state-busy-soft',
      )}
    >
      {session.parent && <CornerDownRight className="absolute top-2.5 left-3 size-3.5 text-fg-muted" />}
      <StateMark state={session.state} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', session.state === 'unread' ? 'font-semibold' : 'font-medium')}>{session.name}</p>
        <p className="flex items-center gap-1 truncate text-xs text-fg-muted">
          <AgentMark agent={session.agent} />
          {metaOf(session)}
        </p>
        {!compact && <p className="mt-0.5 truncate text-xs">{session.last}</p>}
      </div>
    </motion.div>
  )
}

/** Side chats fold into one line under their parent ("1 side chat · 1 unread"), as the app lists them. */
function SideChatLine({ target, flash, unread }: { target: string; flash: boolean; unread: boolean }) {
  return (
    <motion.div
      {...enter}
      data-demo={target}
      className={cn(
        'flex items-center gap-1.5 border-b border-border py-1.5 pr-3 pl-9 text-xs text-fg-muted transition-colors duration-500',
        flash && 'bg-state-busy-soft',
      )}
    >
      <MessageSquareText className="size-3.5 shrink-0" />1 side chat
      {unread && <span className="font-medium text-accent">· 1 unread</span>}
    </motion.div>
  )
}
