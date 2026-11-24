import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from '../model/facets'
import { ChipGroupDialog } from './chip-group-dialog'

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const entry = (id: string, name: string, project: string): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: {
    id,
    name,
    cwd: `/home/me/${project}`,
    project,
    project_source: 'set',
    machine: 'mac',
    state: 'idle',
    updated_at: '2026-11-05T10:00:00Z',
  } as Session,
})

it('shows a project holding some of its sessions as mixed, and finds a session by its name', () => {
  const onSave = vi.fn()
  render(
    <ChipGroupDialog
      group={{ id: 'g', name: 'Focus', projects: [], sessions: ['s2'] }}
      entries={[entry('s1', 'Plan the release', 'muxtower'), entry('s2', 'Fix the lights', 'ha'), entry('s3', 'Dashboards', 'ha')]}
      onSave={onSave}
      onClose={() => {}}
    />,
  )
  const ha = screen.getAllByRole('checkbox').find((c) => c.closest('label')?.textContent?.startsWith('ha'))!
  expect(ha).toHaveAttribute('aria-checked', 'mixed')
  expect((ha as HTMLInputElement).indeterminate).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: 'Find a project or session' }), { target: { value: 'release' } })
  expect(screen.getByText('Plan the release')).toBeInTheDocument() // its project opened by the search
  expect(screen.queryByText('Fix the lights')).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: /Plan the release/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSave).toHaveBeenCalledWith('Focus', { projects: [], sessions: ['s2', 's1'], roles: [] })
})

const row = (name: string) =>
  screen
    .getAllByRole('checkbox')
    .find((c) => c.closest('label')?.textContent?.startsWith(name))!
    .closest('label')!

it('a held project no session has, live or archived, is greyed "No sessions" with Remove; one with only archived ones is not', () => {
  const onRemove = vi.fn()
  const archived = {
    ...entry('s9', 'Old notes', 'acme/archive'),
    session: { ...entry('s9', 'Old notes', 'acme/archive').session, archived_at: '2026-11-01T10:00:00Z' } as Session,
  }
  render(
    <ChipGroupDialog
      group={{ id: 'g', name: 'Focus', projects: ['acme/web', 'acme/gone', 'acme/archive'], sessions: [] }}
      entries={[entry('s1', 'Plan the launch', 'acme/web'), archived]}
      onSave={() => {}}
      onRemove={onRemove}
      onClose={() => {}}
    />,
  )
  expect(row('acme/gone')).toHaveTextContent('No sessions')
  expect(row('acme/archive')).not.toHaveTextContent('No sessions')
  expect(screen.queryByRole('button', { name: 'Remove acme/archive from the group' })).toBeNull()
  expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Remove acme/gone from the group' }))
  expect(onRemove).toHaveBeenCalledWith('acme/gone')
  expect(screen.queryByText('acme/gone')).toBeNull()
})

it('a folder entry says it is a folder: "name/ folder", never a project of that name', () => {
  const folder: SessionEntry = {
    ...entry('s2', 'Scratch', 'web'),
    session: { ...entry('s2', 'Scratch', 'web').session, project: null, project_source: null } as unknown as Session,
  }
  render(
    <ChipGroupDialog
      group={{ id: 'g', name: 'F', projects: [], sessions: [] }}
      entries={[entry('s1', 'Plan the launch', 'acme/web'), folder]}
      onSave={() => {}}
      onClose={() => {}}
    />,
  )
  expect(row('web/')).toHaveTextContent(/^web\/folder1$/)
  expect(row('acme/web')).not.toHaveTextContent('folder')
})
