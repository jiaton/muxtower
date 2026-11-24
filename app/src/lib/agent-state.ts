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

/** A dialog of Claude Code's that muxtower knows only as one (`pending.kind`: a tip, /config, "Resume this
 *  conversation?"): not a question of the agent's. Its `pending.detail` is the dialog's title. */
export const DIALOG_KIND = 'dialog'
export const DIALOG_REASON = 'Waiting on a Claude Code dialog'

/** A state's name, or "In a dialog" for such a dialog. */
export function stateLabel(state: AgentState, kind?: string | null): string {
  return kind === DIALOG_KIND && state !== 'idle' && state !== 'busy' ? 'In a dialog' : STATE_LABEL[state]
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
