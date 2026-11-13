import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  ClipboardList,
  LoaderCircle,
  MessageCircleQuestion,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { STATE_LABEL } from '@/lib/agent-state'
import type { AgentState } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { motion, text } from './styles'

const ICONS: Record<AgentState, { icon: typeof CircleDot; className: string }> = {
  needs_permission: { icon: ShieldAlert, className: text({ tone: 'warning' }) },
  needs_trust: { icon: ShieldAlert, className: text({ tone: 'warning' }) },
  needs_answer: { icon: MessageCircleQuestion, className: text({ tone: 'question' }) },
  plan_review: { icon: ClipboardList, className: text({ tone: 'question' }) },
  error: { icon: CircleAlert, className: text({ tone: 'error' }) },
  busy: { icon: LoaderCircle, className: `${text({ tone: 'busy' })} ${motion({ spin: 'slow' })}` },
  idle: { icon: CircleDot, className: text({ tone: 'idle' }) },
  unknown: { icon: CircleDot, className: text({ tone: 'idle' }) },
}

/** A session's state at a glance (with its name for screen readers). `assistant` marks the concierge;
 *  `unread`, a finished turn the owner has not looked at. */
export function StatusIcon({
  state,
  assistant,
  unread,
  className,
}: {
  state: AgentState
  assistant?: boolean
  unread?: boolean
  className?: string
}) {
  const resting = state === 'idle' || state === 'unknown'
  const { icon: Icon, className: tone } =
    resting && unread
      ? { icon: CircleCheck, className: text({ tone: 'accent' }) }
      : resting && assistant
        ? { icon: Sparkles, className: text({ tone: 'accent' }) }
        : ICONS[state]
  const label = resting && unread ? 'Finished, unread' : STATE_LABEL[state]
  return <Icon role="img" aria-label={label} className={cn('size-4 shrink-0', tone, className)} />
}
