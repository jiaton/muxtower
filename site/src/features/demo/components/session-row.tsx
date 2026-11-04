import { CornerDownRight, ListTodo, MessageSquareDashed } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { deviceName, type Session } from '../model/world'
import { AgentMark, SOURCE_LABEL, StateMark } from './marks'

interface Props {
  session: Session
  /** `data-demo` id the cursor aims at. */
  target: string
  flash: boolean
  selected?: boolean
  compact?: boolean
}

/** One session in a list: state, name, where it runs, what it said last. A fork or side chat sits
 *  under its parent, indented. */
export function SessionRow({ session, target, flash, selected, compact }: Props) {
  const child = Boolean(session.parent)
  if (session.sideChat) return <SideChatLine session={session} target={target} flash={flash} />
  const meta = [session.role, deviceName(session.device), session.project.split('/')[1], SOURCE_LABEL[session.source]]
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      data-demo={target}
      className={cn(
        'relative flex gap-2.5 border-b border-border px-3 transition-colors duration-500',
        'py-2',
        child && 'pl-8',
        selected && 'bg-muted',
        flash && 'bg-state-busy-soft',
      )}
    >
      {child && <CornerDownRight className="absolute top-3 left-3 size-3.5 text-fg-muted" />}
      <StateMark state={session.state} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('truncate text-sm', session.state === 'unread' ? 'font-semibold' : 'font-medium')}>{session.title}</span>
          {session.parent && <Badge variant="outline">fork</Badge>}
        </div>
        <p className="flex items-center gap-1 truncate text-xs text-fg-muted">
          <AgentMark agent={session.agent} />
          {meta.filter(Boolean).join(' · ')}
        </p>
        {!compact && <p className="mt-0.5 truncate text-xs text-fg">{session.last}</p>}
        {session.task && (
          <p className="mt-1 flex items-center gap-1 text-xs text-accent">
            <ListTodo className="size-3" />
            task {session.task}
          </p>
        )}
      </div>
    </motion.div>
  )
}

/** Side chats fold into one line under their parent ("1 side chat"), as the app lists them. */
function SideChatLine({ session, target, flash }: Pick<Props, 'session' | 'target' | 'flash'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      data-demo={target}
      className={cn(
        'flex items-center gap-2 border-b border-border py-1.5 pr-3 pl-8 text-xs text-fg-muted transition-colors duration-500',
        flash && 'bg-state-busy-soft',
      )}
    >
      <MessageSquareDashed className="size-3.5 shrink-0" />
      <span className="shrink-0">1 side chat</span>
      <span className="truncate text-fg">· {session.title}</span>
    </motion.div>
  )
}
