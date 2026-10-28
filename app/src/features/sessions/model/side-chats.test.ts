import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { SessionEntry } from './facets'
import { foldSideChats } from './side-chats'

const daemon = { id: 'd1', name: 'nas', url: 'https://nas', token: 't' }
const entry = (id: string, over: Partial<Session> = {}): SessionEntry => ({
  key: `d1/${id}`, daemon, session: { id, name: 'Travel', needs_attention: false, ...over } as Session,
}) // prettier-ignore

it('holds side chats under the session they were asked beside, while that one is listed and they need nothing', () => {
  const main = entry('cse_main')
  const side = entry('cse_side', { fork_of: 'cse_main', side_chat: true })
  const asking = entry('cse_ask', { fork_of: 'cse_main', side_chat: true, needs_attention: true })
  const fork = entry('cse_fork', { fork_of: 'cse_main' })
  const orphan = entry('cse_orphan', { fork_of: 'cse_gone', side_chat: true })
  const { shown, sideChats } = foldSideChats([main, side, asking, fork, orphan])
  expect(shown.map((e) => e.session.id)).toEqual(['cse_main', 'cse_ask', 'cse_fork', 'cse_orphan'])
  expect(sideChats.get('d1/cse_main')?.map((e) => e.session.id)).toEqual(['cse_side'])
})
