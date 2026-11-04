import { Asterisk, Circle, CircleCheck, Hexagon, LoaderCircle, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent, SessionState, Source } from '../model/world'

const STATE = {
  working: { icon: LoaderCircle, label: 'Working', className: 'animate-spin text-state-busy' },
  idle: { icon: Circle, label: 'Idle', className: 'text-state-idle' },
  unread: { icon: CircleCheck, label: 'Finished, unread', className: 'text-accent' },
  permission: { icon: ShieldAlert, label: 'Needs approval', className: 'text-state-permission' },
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

export const SOURCE_LABEL: Record<Source, string> = { tmux: 'tmux', desktop: 'Claude desktop', 'codex-app': 'Codex app' }
