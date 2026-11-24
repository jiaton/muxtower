import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, TeamTask } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from '../model/facets'
import { ProjectTeamDialog, TeamDialog } from './team-dialog'
import { NO_TASKS_YET } from './team-tasks'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="#settings" className={className}>
      {children}
    </a>
  ),
}))

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const session = (id: string, name: string, more: Partial<Session> = {}): Session =>
  ({
    id,
    name,
    cwd: '/home/dev/code/billing',
    project: 'acme/billing',
    machine: 'build-box',
    state: 'idle',
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
    ...more,
  }) as Session
const LEAD = session('lead', 'billing lead', {
  team_role: 'tech lead — splits and merges',
  state: 'busy',
  created_at: '2026-11-20T11:00:00Z',
})
const WORKER = session('meter', 'seat meter', { team_role: 'worker', state: 'needs_permission', created_at: '2026-11-20T09:00:00Z' })
const REVIEW = session('review', 'review', { team_role: 'reviewer', machine: 'laptop', created_at: '2026-11-20T12:00:00Z' })
const OTHER = session('docs', 'docs', { project: 'acme/docs', team_role: 'writer' })
let entries: SessionEntry[] = []
vi.mock('../hooks/use-session-entries', () => ({ useSessionEntries: () => ({ entries }) }))

const mutate = vi.fn()
const update = { mutate, isPending: false, isError: false, isSuccess: false, error: null as Error | null }
const task = (id: number, from: string, to: string, text: string, minutes: number, status = 'delivered'): TeamTask => ({
  id,
  at: new Date(Date.now() - minutes * 60_000).toISOString(),
  from_id: from,
  from_label: from,
  to_id: to,
  text,
  status,
  delivered_at: null,
})
let tasksIn: Record<number, TeamTask[]> = {}
vi.mock('../api/use-team', () => ({
  useUpdateTeam: () => update,
  useProjectActivity: (_d: string, project: string | null, hours: number) => ({
    data: project ? { project, members: [], messages: [], tasks: tasksIn[hours] ?? [] } : undefined,
  }),
}))
vi.mock('../api/use-project-colours', () => ({
  useProjectHue: (name: string | null) => (name === 'acme/billing' ? 3 : null),
  useProjectColours: () => ({ 'acme/billing': 3, 'acme/docs': 5 }),
}))
vi.mock('@/lib/daemons/store', () => ({ usePairedDaemons: () => [daemon] }))
vi.mock('@/features/playbook/api/use-playbook', () => ({
  usePlaybook: () => ({ data: { shared: { text: 'Report to the lead.' }, projects: [] } }),
}))

beforeAll(() => {
  // Radix's popover measures its anchor.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  entries = [LEAD, WORKER, REVIEW, OTHER].map((s) => ({ key: `d1/${s.id}`, daemon, session: s }))
  tasksIn = {}
  mutate.mockReset()
  navigate.mockReset()
  Object.assign(update, { isPending: false, isError: false, isSuccess: false, error: null })
})

const open = (s = LEAD, onClose = () => {}) => render(<TeamDialog daemonId="d1" session={s} onClose={onClose} />)
const field = (name: string) => screen.getByRole('combobox', { name })

describe('TeamDialog', () => {
  it('is titled by the project, with its colour dot, the session named under it', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Team · acme/billing' })
    expect(within(dialog).getByRole('heading', { name: 'Team · acme/billing' }).querySelector('[data-hue="3"]')).not.toBeNull()
    expect(dialog).toHaveAccessibleDescription('billing lead')
  })

  it('saves the role and the note on blur or Enter, and only when changed', () => {
    open()
    const role = field('Role')
    fireEvent.focus(role)
    fireEvent.blur(role)
    expect(mutate).not.toHaveBeenCalled() // unchanged
    fireEvent.change(role, { target: { value: 'tech lead ' } })
    fireEvent.blur(role)
    expect(mutate).toHaveBeenLastCalledWith({ rename_project: false, role: 'tech lead' }, expect.anything())
    fireEvent.focus(role)
    fireEvent.blur(role)
    expect(mutate).toHaveBeenCalledTimes(1) // saved already

    const note = screen.getByRole('textbox', { name: 'Note' })
    expect(note).toHaveAttribute('placeholder', 'Add a note (optional)')
    fireEvent.change(note, { target: { value: 'Owns the 3.1 split' } })
    fireEvent.keyDown(note, { key: 'Enter' })
    expect(mutate).toHaveBeenLastCalledWith({ rename_project: false, note: 'Owns the 3.1 split' }, expect.anything())
    fireEvent.blur(note)
    expect(mutate).toHaveBeenCalledTimes(2)
  })

  it('saves the project on a pick from the list', () => {
    open()
    const project = field('Project')
    fireEvent.focus(project)
    // Every project offered before anything is typed, the current one ticked.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['acme/billing3 sessions', 'acme/docs1 session'])
    expect(screen.getByRole('option', { name: /acme\/billing/ })).toHaveAccessibleName(/current$/)
    fireEvent.click(screen.getByRole('option', { name: /acme\/docs/ }))
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ rename_project: false, project: 'acme/docs' }, expect.anything())
    expect(project).toHaveValue('acme/docs')
  })

  it('saves a typed project on Enter, marked "new project" when no session has it', () => {
    open()
    const project = field('Project')
    fireEvent.focus(project)
    fireEvent.change(project, { target: { value: 'acme/ledger' } })
    expect(project).toHaveAccessibleDescription('new project')
    expect(screen.getByText(/will be a new project/)).toHaveTextContent('acme/ledger will be a new project')
    fireEvent.keyDown(project, { key: 'Enter' })
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ rename_project: false, project: 'acme/ledger' }, expect.anything())
  })

  it('never saves the project on blur: what was typed goes back to the current project', () => {
    open()
    const project = field('Project')
    fireEvent.focus(project)
    fireEvent.change(project, { target: { value: 'acme/doc' } })
    fireEvent.blur(project)
    expect(mutate).not.toHaveBeenCalled()
    expect(project).toHaveValue('acme/billing')
    expect(project).not.toHaveAccessibleDescription()
  })

  it('says "Saved" once a save went through', () => {
    update.isSuccess = true
    open()
    expect(within(screen.getByRole('region', { name: 'This session' })).getByText('Saved')).toBeInTheDocument()
  })

  it('lists the project’s members, leads first, and opens one on a click (closing the dialog)', () => {
    const onClose = vi.fn()
    open(WORKER, onClose)
    const rows = within(screen.getByRole('list', { name: 'Members' })).getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual([
      'billing leadtech leadbuild-box · working',
      'seat meterworkerthis sessionbuild-box · needs you',
      'reviewreviewerlaptop · idle',
    ])
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
    fireEvent.click(rows[2]!)
    expect(onClose).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ params: { daemonId: 'd1', sessionId: 'review' } }))
  })

  it('shows the recent tasks newest first, six then "Show N more", and the 7 days on the switch', () => {
    const day = Array.from({ length: 8 }, (_, i) => task(i, 'lead', 'meter', `Task ${i}\nmore`, 100 - i))
    day[7] = task(7, 'review', 'meter', 'PR 412: approved', 9, 'held')
    tasksIn = { 24: day, 168: [task(20, 'meter', 'lead', 'Last week’s report', 3000), ...day] }
    open()
    const recent = () => screen.getByRole('region', { name: 'Recent tasks' })
    let items = within(recent()).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent(/^review→toseat meterheld9mPR 412: approved$/)
    expect(items[1]).toHaveTextContent(/^billing lead→toseat meter.*Task 6$/) // the first line only
    fireEvent.click(within(recent()).getByRole('button', { name: 'Show 2 more' }))
    expect(within(recent()).getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(within(recent()).getByRole('radio', { name: '7 days' }))
    items = within(recent()).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(within(recent()).getByRole('button', { name: 'Show 3 more' })).toBeInTheDocument()
  })

  it('says how a team starts when its sessions never sent each other anything', () => {
    open()
    expect(within(screen.getByRole('region', { name: 'Recent tasks' })).getByText(NO_TASKS_YET)).toBeInTheDocument()
    expect(NO_TASKS_YET).toBe('No tasks yet. Sessions in this project can hand each other work.')
  })

  it('says an empty window as such when the week had tasks', () => {
    tasksIn = { 168: [task(1, 'lead', 'meter', 'Count seats', 3000)] }
    open()
    expect(screen.getByText('No tasks in the last 24 hours.')).toBeInTheDocument()
  })

  it('ends with the playbook row', () => {
    open()
    const row = screen.getByText(/^Playbook:/)
    expect(row).toHaveTextContent('Playbook: shared · Edit')
    expect(within(row).getByRole('link', { name: 'Edit' })).toBeInTheDocument()
  })

  it('without a project, has no team to show yet', () => {
    open(session('solo', 'scratch', { project: null }))
    expect(screen.getByRole('dialog', { name: 'Team' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Team' })).toBeNull()
    expect(screen.getByText('No project yet. Pick one above to join its team.')).toBeInTheDocument()
  })
})

describe('ProjectTeamDialog', () => {
  it('shows the team alone, no session marked', () => {
    render(<ProjectTeamDialog daemonId="d1" project="acme/billing" onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Team · acme/billing' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'This session' })).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Members' })).getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByText('this session')).toBeNull()
  })
})
