import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from '../model/facets'
import type { Group } from '../model/query'
import { useListPrefs } from '../store'
import { SessionList } from './session-list'

const drawn = vi.hoisted(() => ({ rows: [] as string[] }))
vi.mock('./session-list-row', () => ({
  SessionListRow: ({ entry }: { entry: SessionEntry }) => {
    drawn.rows.push(entry.session.name)
    return <div>{entry.session.name}</div>
  },
}))

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const entry = (id: string, over: Partial<Session> = {}): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: {
    id,
    name: id,
    runtime: 'claude-code',
    cwd: '/home/me',
    machine: 'hub',
    state: 'idle',
    needs_attention: false,
    ...over,
  } as Session,
})
const implies = { device: true, folder: false, source: false, account: false, agent: false }
const device = (entries: Record<string, SessionEntry[]>): Group => ({
  key: 'hub',
  label: 'hub',
  implies,
  entries: Object.values(entries).flat(),
  sections: Object.entries(entries).map(([key, list]) => ({ key, label: key, entries: list })),
})

beforeEach(() => {
  drawn.rows = []
  useListPrefs.setState({ collapsed: [] })
})

it('folds one folder without drawing any other row again, and draws again only a session that changed', () => {
  const acme = [entry('Acme onboarding'), entry('Acme pricing')]
  const notes = [entry('Weekly notes')]
  const { rerender } = render(<SessionList groups={[device({ '~/acme': acme, '~/notes': notes })]} foldScope="device" />)
  expect(drawn.rows.sort()).toEqual(['Acme onboarding', 'Acme pricing', 'Weekly notes'])

  drawn.rows = []
  fireEvent.click(screen.getByRole('button', { name: /acme/ }))
  expect(screen.queryByText('Acme pricing')).toBeNull()
  expect(drawn.rows).toEqual([]) // the folder's rows went, and no other row was drawn again

  drawn.rows = []
  const changed = { ...notes[0]!, session: { ...notes[0]!.session, state: 'busy' } as Session }
  rerender(<SessionList groups={[device({ '~/acme': acme, '~/notes': [changed] })]} foldScope="device" />)
  expect(drawn.rows).toEqual(['Weekly notes'])
})

it('counts a folded folder and says how many need you', () => {
  const acme = [entry('Acme onboarding', { needs_attention: true }), entry('Acme pricing')]
  render(<SessionList groups={[device({ '~/acme': acme })]} foldScope="device" />)
  fireEvent.click(screen.getByRole('button', { name: /acme/ }))
  const header = screen.getByRole('button', { name: /acme/ })
  expect(header).toHaveAttribute('aria-expanded', 'false')
  expect(header.textContent).toMatch(/1 need you\s*2/)
})
