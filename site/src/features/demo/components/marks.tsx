import { Asterisk, Circle, CircleCheck, Hexagon, LoaderCircle, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent, SessionState } from '../model/world'
import { stateInk } from '@app/components/ui/intents'

// Each state's mark in the app's own tone (`stateInk`), so the drawing follows the app.
const STATE = {
  working: { icon: LoaderCircle, label: 'Working', className: stateInk.busy },
  idle: { icon: Circle, label: 'Idle', className: stateInk.idle },
  unread: { icon: CircleCheck, label: 'Finished, unread', className: stateInk.unread },
  permission: { icon: ShieldAlert, label: 'Needs approval', className: stateInk.needs_permission },
} satisfies Record<SessionState, { icon: typeof Circle; label: string; className: string }>

/** A session's state, drawn as the app draws it. */
export function StateMark({ state, className }: { state: SessionState; className?: string }) {
  const { icon: Icon, label, className: look } = STATE[state]
  return <Icon role="img" aria-label={label} className={cn('size-4 shrink-0', look, className)} />
}

export const stateLabel = (state: SessionState) => STATE[state].label

/** Claude Code or Codex, by a plain mark (never their logos). */
export function AgentMark({ agent, className }: { agent: Agent; className?: string }) {
  const Icon = agent === 'claude' ? Asterisk : Hexagon
  return <Icon role="img" aria-label={agent === 'claude' ? 'Claude Code' : 'Codex'} className={cn('size-3 shrink-0', className)} />
}
