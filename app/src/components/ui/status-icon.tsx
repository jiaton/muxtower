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
import { stateInk } from './intents'

const ICONS: Record<AgentState, typeof CircleDot> = {
  needs_permission: ShieldAlert,
  needs_trust: ShieldAlert,
  needs_answer: MessageCircleQuestion,
  plan_review: ClipboardList,
  error: CircleAlert,
  busy: LoaderCircle,
  idle: CircleDot,
  unknown: CircleDot,
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
  const [Icon, tone] =
    resting && unread
      ? [CircleCheck, stateInk.unread]
      : resting && assistant
        ? [Sparkles, stateInk.assistant]
        : [ICONS[state], stateInk[state]]
  const label = resting && unread ? 'Finished, unread' : STATE_LABEL[state]
  return <Icon role="img" aria-label={label} className={cn('size-4 shrink-0', tone, className)} />
}
