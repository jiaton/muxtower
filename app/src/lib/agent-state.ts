import type { BadgeTone } from '@/components/ui/badge'
import type { AgentState } from '@/lib/api/types'

export const STATE_LABEL: Record<AgentState, string> = {
  needs_permission: 'Needs approval',
  needs_answer: 'Has a question',
  needs_trust: 'Trust prompt',
  plan_review: 'Plan to review',
  error: 'Error',
  busy: 'Working',
  idle: 'Idle',
  unknown: 'Unknown',
}

export const STATE_TONE: Record<AgentState, BadgeTone> = {
  needs_permission: 'permission',
  needs_answer: 'question',
  needs_trust: 'permission',
  plan_review: 'question',
  error: 'error',
  busy: 'busy',
  idle: 'idle',
  unknown: 'idle',
}
