import { Asterisk, Bot, Braces, Hexagon, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/** One shape per agent, never a color: in this app color says what a session needs (its state), and
 *  an agent's color beside a state's would read as one. */
const ICONS: Record<string, LucideIcon> = { 'Claude Code': Asterisk, Codex: Hexagon, opencode: Braces }

/** The icon of an agent label (`agentOf`). */
export const agentIcon = (agent: string): LucideIcon => ICONS[agent] ?? Bot

/** Which agent a session is, as a small mark named for screen readers and on hover; `decorative` where
 *  its name is written beside it. */
export function AgentMark({ agent, decorative, className }: { agent: string; decorative?: boolean; className?: string }) {
  const Icon = agentIcon(agent)
  const named = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': agent, title: agent }
  return (
    <span {...named} className={cn('inline-flex size-3.5 shrink-0', className)}>
      <Icon aria-hidden className="size-full" />
    </span>
  )
}
