import { CircleAlert, CircleDot, ClipboardList, LoaderCircle, MessageCircleQuestion, ShieldAlert, Sparkles } from 'lucide-react'
import { STATE_LABEL } from '@/lib/agent-state'
import type { AgentState } from '@/lib/api/types'
import { cn } from '@/lib/cn'

const ICONS: Record<AgentState, { icon: typeof CircleDot; className: string }> = {
  needs_permission: { icon: ShieldAlert, className: 'text-state-permission' },
  needs_trust: { icon: ShieldAlert, className: 'text-state-permission' },
  needs_answer: { icon: MessageCircleQuestion, className: 'text-state-question' },
  plan_review: { icon: ClipboardList, className: 'text-state-question' },
  error: { icon: CircleAlert, className: 'text-state-error' },
  busy: { icon: LoaderCircle, className: 'animate-spin text-state-busy [animation-duration:2s]' },
  idle: { icon: CircleDot, className: 'text-state-idle' },
  unknown: { icon: CircleDot, className: 'text-state-idle' },
}

/** A session's state at a glance (with its name for screen readers). `assistant` marks the concierge. */
export function StatusIcon({ state, assistant, className }: { state: AgentState; assistant?: boolean; className?: string }) {
  const { icon: Icon, className: tone } =
    assistant && (state === 'idle' || state === 'unknown') ? { icon: Sparkles, className: 'text-accent' } : ICONS[state]
  return <Icon role="img" aria-label={STATE_LABEL[state]} className={cn('size-4 shrink-0', tone, className)} />
}
