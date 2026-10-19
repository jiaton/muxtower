/** Words and numbers as the glasses show them. */
import type { AgentState } from '@/hub/types'

const STATE_LABELS: Record<AgentState, string> = {
  needs_permission: 'approve',
  needs_answer: 'question',
  needs_trust: 'trust',
  plan_review: 'plan',
  error: 'error',
  busy: 'working',
  idle: 'idle',
  unknown: '?',
}

export const stateLabel = (state: AgentState) => STATE_LABELS[state] ?? state

/** "now", "4m", "2h", "3d" since `iso`. */
export function age(iso: string | null | undefined, now: number): string {
  if (!iso) return ''
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (!(minutes >= 1)) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

/** Markdown read aloud, more or less: fences, emphasis and heading marks dropped, bullets kept short. */
export function plain(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '· ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}
