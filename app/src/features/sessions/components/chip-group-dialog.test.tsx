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
  expect(onSave).toHaveBeenCalledWith('Focus', { projects: [], sessions: ['s2', 's1'] })
})
