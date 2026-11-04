import type { Session } from '@/lib/api/types'

/** Who else writes in its worktree lately, and which files both changed (`session.also_writing`, from
 *  file-editing tools only): what its row's mark says on hover. Null while nobody else does. */
export function alsoWritingText(session: Session): string | null {
  const others = session.also_writing ?? []
  if (!others.length) return null
  const files = [...new Set(others.flatMap((w) => w.files))]
  const names = [...new Set(others.map((w) => w.name))].join(', ')
  return `also writing here: ${names}` + (files.length ? `\nboth changed: ${files.slice(0, 8).join(', ')}${files.length > 8 ? '…' : ''}` : '')
}
