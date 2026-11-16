import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Session, TeamActivity } from '@/lib/api/types'
import { TeamDiagram } from './team-diagram'

const state = vi.hoisted(() => ({ activity: undefined as TeamActivity | undefined }))
vi.mock('../api/use-team', () => ({ useProjectActivity: () => ({ data: state.activity }) }))
const sessions = [
  { id: 'pm', name: 'pm', team_role: 'PM', state: 'idle', machine: 'nas', project: 'acme/web' },
  { id: 'w', name: 'w', team_role: 'worker', state: 'busy', machine: 'nas', project: 'acme/web' },
  { id: 'r', name: 'r', team_role: 'reviewer', state: 'idle', machine: 'mac', project: 'acme/web' },
  { id: 'x', name: 'x', team_role: 'explainer', state: 'idle', machine: 'mac', project: 'acme/web' },
] as Session[]
vi.mock('../hooks/use-session-entries', () => ({
  useSessionEntries: () => ({ entries: sessions.map((session) => ({ daemon: { id: 'd1' }, session })) }),
}))
const at = new Date(Date.now() - 3_600_000).toISOString()
const task = (id: number, from: string, to: string, status = 'delivered') => ({
  id, at, from_id: from, from_label: from, to_id: to, text: `task ${id}`, status, delivered_at: null,
}) // prettier-ignore

beforeEach(() => {
  state.activity = undefined
})

it('says how a team forms when nothing was sent yet', () => {
  state.activity = { project: 'acme/web', members: ['pm', 'w'], tasks: [], messages: [], owner: {} }
  render(<TeamDiagram daemonId="d1" project="acme/web" />)
  expect(screen.getByText(/Nothing sent in this team yet/)).toBeInTheDocument()
})

it('puts the session it was opened from in the middle, its partners under it, what went each way from its side', () => {
  state.activity = {
    project: 'acme/web',
    members: ['pm', 'w', 'r', 'x'],
    tasks: [task(1, 'pm', 'w', 'held'), task(2, 'pm', 'w'), task(3, 'w', 'pm'), task(4, 'w', 'r'), task(5, 'r', 'pm')],
    messages: [{ at, from_id: 'w', from_label: 'session w', to_id: 'pm' }],
    owner: {},
  }
  render(<TeamDiagram daemonId="d1" project="acme/web" from="w" />)
  const toPm = screen.getByRole('button', { name: 'sent 1 · got 2' })
  expect(toPm).toHaveAttribute('title', 'PM → worker 2, worker → PM 1')
  const toReviewer = screen.getByRole('button', { name: 'sent 1' })
  expect(toReviewer.style.width).toBe(toPm.style.width) // one column: the cards line up
  expect(screen.getByText(/No tasks in 24 h: explainer \(mac\)/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Also' })).toBeInTheDocument() // reviewer → PM
  // A count narrows the feed to that pair; a card puts its role in the middle.
  fireEvent.click(toPm)
  expect(screen.getByText('Only PM ⇄ worker')).toBeInTheDocument()
  expect(screen.queryByText('task 4')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Put PM in the middle' }))
  expect(screen.getByRole('list', { name: 'Who PM works with' })).toBeInTheDocument()
})

it('centres on what the owner works with most when opened from the project', () => {
  state.activity = {
    project: 'acme/web',
    members: ['pm', 'w', 'r'],
    tasks: [task(1, 'pm', 'w'), task(2, 'w', 'pm'), task(3, 'w', 'r')],
    messages: [],
    owner: { r: 5 },
  }
  render(<TeamDiagram daemonId="d1" project="acme/web" />)
  expect(screen.getByRole('list', { name: 'Who reviewer works with' })).toBeInTheDocument()
})

it('keeps the feed folded to a line until asked (remembered in this browser), five rows at first', () => {
  localStorage.removeItem('muxtower.teamFeed')
  state.activity = {
    project: 'acme/web',
    members: ['pm', 'w'],
    tasks: [...Array(8)].map((_, i) => task(i + 1, i % 2 ? 'w' : 'pm', i % 2 ? 'pm' : 'w', i === 0 ? 'held' : 'delivered')),
    messages: [],
    owner: {},
  }
  const { unmount } = render(<TeamDiagram daemonId="d1" project="acme/web" from="pm" between={<p>the fields</p>} />)
  expect(screen.getByText(/^8 tasks in 24 h · 1 held · last/)).toBeInTheDocument()
  expect(screen.queryByText('task 8')).toBeNull() // folded
  const fields = screen.getByText('the fields')
  expect(
    fields.compareDocumentPosition(screen.getByRole('region', { name: 'What was sent' })) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Show tasks' }))
  expect(screen.getAllByText(/^task \d$/)).toHaveLength(5)
  expect(screen.getByRole('button', { name: 'Show more (3)' })).toBeInTheDocument()
  unmount()
  render(<TeamDiagram daemonId="d1" project="acme/web" from="pm" />)
  expect(screen.getByRole('button', { name: 'Hide tasks' })).toBeInTheDocument() // left open: open again
  localStorage.removeItem('muxtower.teamFeed')
})

it('shows who sent whom in a matrix with every role named in full; a cell opens the feed on that pair', () => {
  localStorage.removeItem('muxtower.teamFeed')
  state.activity = {
    project: 'acme/web',
    members: ['pm', 'w', 'r'],
    tasks: [task(1, 'pm', 'w'), task(2, 'pm', 'w'), task(3, 'w', 'r'), task(4, 'r', 'pm')],
    messages: [],
    owner: {},
  }
  render(<TeamDiagram daemonId="d1" project="acme/web" from="pm" />)
  fireEvent.click(screen.getByRole('radio', { name: 'Who → whom' }))
  const matrix = screen.getByRole('table')
  expect(matrix).toHaveTextContent('reviewer') // in full
  fireEvent.click(screen.getByRole('button', { name: '2' })) // PM → worker
  expect(screen.getByText('Only PM ⇄ worker')).toBeInTheDocument()
  expect(screen.getByText('task 1')).toBeInTheDocument() // opened by the cell
  expect(screen.queryByText('task 3')).toBeNull()
})
