import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { alsoWritingText } from './writes'

it('says who else writes in its worktree, and the files both changed, only when someone does', () => {
  const session = (also_writing: Session['also_writing']) => ({ also_writing }) as Session
  expect(alsoWritingText(session([]))).toBeNull()
  const w = (name: string, files: string[]) => ({ worktree: '/r', session_id: name, name, files })
  expect(alsoWritingText(session([w('worker', [])]))).toBe('also writing here: worker')
  expect(alsoWritingText(session([w('worker', ['a.py']), w('docs', ['a.py', 'b.md'])]))).toBe(
    'also writing here: worker, docs\nboth changed: a.py, b.md',
  )
})
