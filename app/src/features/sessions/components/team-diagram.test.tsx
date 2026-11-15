import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Session, TeamActivity } from '@/lib/api/types'
import { TeamDiagram } from './team-diagram'

const state = vi.hoisted(() => ({ activity: undefined as TeamActivity | undefined }))
vi.mock('../api/use-team', () => ({ useProjectActivity: () => ({ data: state.activity }) }))
const sessions = [
  { id: 'pm', name: 'pm', team_role: 'PM', state: 'idle', machine: 'build-box', project: 'acme/web' },
  { id: 'w', name: 'w', team_role: 'worker', state: 'busy', machine: 'build-box', project: 'acme/web' },
] as Session[]
vi.mock('../hooks/use-session-entries', () => ({
  useSessionEntries: () => ({ entries: sessions.map((session) => ({ daemon: { id: 'd1' }, session })) }),
}))

beforeEach(() => {
  state.activity = undefined
})

it('says how a team forms when nothing was sent yet', () => {
  state.activity = { project: 'acme/web', members: ['pm', 'w'], tasks: [], messages: [] }
  render(<TeamDiagram daemonId="d1" project="acme/web" />)
  expect(screen.getByText(/Nothing sent in this team yet/)).toBeInTheDocument()
  expect(screen.getByText('send_task')).toBeInTheDocument()
})

it('draws who sent whom what; a tap on an edge or a mark says what it was', () => {
  const at = new Date(Date.now() - 3_600_000).toISOString()
  state.activity = {
    project: 'acme/web',
    members: ['pm', 'w'],
    tasks: [{ id: 1, at, from_id: 'pm', from_label: 'pm (PM)', to_id: 'w', text: 'Build the chart.', status: 'held', delivered_at: null }],
    messages: [{ at, from_id: 'w', from_label: 'session w', to_id: 'pm' }],
  }
  const { container } = render(<TeamDiagram daemonId="d1" project="acme/web" />)
  expect(screen.getByRole('img', { name: '2 in the team, 1 tasks' })).toBeInTheDocument()
  fireEvent.click(container.querySelector('svg circle')!) // the edge's count
  expect(screen.getByText('PM → worker · 1 task · 1 waiting')).toBeInTheDocument()
  expect(screen.getByText('Build the chart.')).toBeInTheDocument()
  const marks = container.querySelectorAll('section svg[aria-label$="sent in this time"] g')
  fireEvent.click(marks[marks.length - 1]!) // the message
  expect(screen.getByText('Typed into the session (its text is not kept).')).toBeInTheDocument()
})
