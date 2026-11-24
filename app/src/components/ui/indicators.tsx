import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react'
import type { AgentState } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { stateTone, text } from './styles'

type Tone = NonNullable<Parameters<typeof text>[0]>['tone']

/** Something on its way: a turning circle, in a tone. */
export function Spinner({ tone, className, label }: { tone?: Tone; className?: string; label?: string }) {
  return (
    <LoaderCircle
      className={cn('size-4 shrink-0 animate-spin', text({ tone }), className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  )
}

/** A fold's chevron: right when closed, down when open, turning between; `vertical`: down when closed, up
 *  when open (what opens below a card). */
export function Chevron({
  open,
  vertical = false,
  quiet = false,
  className,
}: {
  open: boolean
  vertical?: boolean
  quiet?: boolean
  className?: string
}) {
  const Icon = vertical ? ChevronDown : ChevronRight
  return (
    <Icon
      aria-hidden
      className={cn(
        'shrink-0 transition-transform',
        open && (vertical ? 'rotate-180' : 'rotate-90'),
        quiet && text({ tone: 'muted' }),
        className,
      )}
    />
  )
}

const DOT = {
  accent: 'bg-accent',
  danger: 'bg-danger',
  idle: 'bg-state-idle',
  warning: 'bg-state-permission',
  success: 'bg-success',
  muted: 'bg-fg-muted/50',
  question: 'bg-state-question',
  busy: 'bg-state-busy',
  error: 'bg-state-error',
} as const

/** A small round mark in a tone, pulsing while something goes on. */
export function Dot({ tone, pulse = false, className }: { tone: keyof typeof DOT; pulse?: boolean; className?: string }) {
  return <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', DOT[tone], pulse && 'animate-pulse', className)} />
}

/** A session's state as a dot in its state's tone (`stateTone`), smaller than a `Dot`, where a word beside
 *  it names the state (a team's member row). Not `StatusIcon`: it has no shape of its own, so it never stands
 *  alone. Not `StatusDot`: that is a machine's. */
export function StateDot({ state, className }: { state: AgentState; className?: string }) {
  return <Dot tone={stateTone[state]} className={cn('size-2', className)} />
}
