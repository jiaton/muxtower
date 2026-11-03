import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { SessionEntry } from './facets'
import { foldForks, forksUnder } from './forks'

const daemon = { id: 'd1', name: 'nas', url: 'https://nas', token: 't' }
const entry = (id: string, over: Partial<Session> = {}): SessionEntry => ({
  key: `d1/${id}`, daemon, session: { id, name: id, needs_attention: false, ...over } as Session,
}) // prettier-ignore

it('holds forks under the session they were forked from, forks of forks under theirs', () => {
  const main = entry('main')
  const fork = entry('fork', { fork_of: 'main' })
  const again = entry('again', { fork_of: 'fork' })
  const side = entry('side', { fork_of: 'main', side_chat: true }) // side chats fold their own way
  const orphan = entry('orphan', { fork_of: 'gone' })
  const { shown, forks } = foldForks([main, fork, again, side, orphan])
  expect(shown.map((e) => e.session.id)).toEqual(['main', 'side', 'orphan'])
  expect(forks.get('d1/main')?.map((e) => e.session.id)).toEqual(['fork'])
  expect(forksUnder('d1/main', forks).map((e) => e.session.id)).toEqual(['fork', 'again'])
})

it('keeps forks that point at each other as rows of their own', () => {
  const a = entry('a', { fork_of: 'b' })
  const b = entry('b', { fork_of: 'a' })
  expect(foldForks([a, b]).shown.map((e) => e.session.id)).toEqual(['a', 'b'])
})
