/** The owner's team playbook as sessions read it (the daemon's `playbook/service.py` `render`, kept in step):
 *  each part marked where it comes from, cut at `INLINE` characters in my_team. */
import type { PlaybookPart } from '@/lib/api/types'

export const SHARED = 'shared'
export const PROJECTS = 'projects/'
export const INLINE = 1500

export const scopeOf = (project: string | null) => (project ? `${PROJECTS}${project}` : SHARED)
export const projectOf = (scope: string) => (scope.startsWith(PROJECTS) ? scope.slice(PROJECTS.length) : null)

function label(part: PlaybookPart): string {
  const project = projectOf(part.scope)
  if (!project) return `shared (v${part.version})`
  return `${project} ${part.mode === 'add' ? 'adds' : 'replaces the shared one'} (v${part.version})`
}

/** What a session reads at the top of my_team; empty when there is none. */
export function render(parts: PlaybookPart[], limit: number | null = INLINE): string {
  if (!parts.length) return ''
  const lines = ["Team playbook (the owner's: how their teams work; follow it):"]
  for (const part of parts) lines.push(`— ${label(part)} —`, ...part.text.trim().split('\n'))
  const size = (list: string[]) => list.reduce((n, l) => n + l.length + 1, 0)
  if (limit === null || size(lines) <= limit) return lines.join('\n')
  const kept: string[] = []
  for (const line of lines) {
    if (size(kept) + line.length > limit) break
    kept.push(line)
  }
  const left = lines.length - kept.length
  return [...kept, `… ${left} more line${left === 1 ? '' : 's'}: read_playbook for all of it`].join('\n')
}

/** The parts a session of `project` reads (the daemon's `effective`), for a draft not saved yet. */
export function effective(shared: PlaybookPart, own: PlaybookPart | null): PlaybookPart[] {
  if (own && own.mode === 'replace' && own.version) return own.text.trim() ? [own] : []
  return [shared, own].filter((p): p is PlaybookPart => !!p && !!p.text.trim())
}
