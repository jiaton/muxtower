import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MachinesList } from './nodes-list'

const removeNode = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, search, ...props }: { children: ReactNode; search?: { node?: string } }) => (
    <a href="#settings" data-node={search?.node ?? ''} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('../api/use-daemon-me', () => ({
  useDaemonMe: () => ({ data: { daemon_name: 'nas', version: '0.1.67', default_folder: '/home/me' } }),
}))
vi.mock('@/features/sessions/api/use-sessions', () => ({
  useDaemonSessions: () => ({
    data: [
      { id: 'a', node: null },
      { id: 'b', node: null },
      { id: 'c', node: 'mac' },
    ],
  }),
}))
vi.mock('@/lib/daemons/use-nodes', () => ({
  useNodes: () => ({
    data: [
      {
        name: 'mac',
        online: true,
        version: '0.1.66',
        update: '0.1.67',
        sessions: 9,
        default_folder: '/Users/me/workspace',
        last_seen: null,
      },
      { name: 'old', online: false, version: '0.1.60', update: null, sessions: 0, default_folder: null, last_seen: '2026-11-01T10:00:00Z' },
    ],
  }),
}))
vi.mock('../api/use-nodes', () => ({
  useRemoveNode: () => ({ mutate: removeNode, isPending: false }),
  useJoinCode: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  useSetNodeAddress: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('./node-address', () => ({ NodeAddress: () => null }))

beforeEach(() => removeNode.mockClear())

const row = (name: string) => screen.getByText(name, { selector: 'span.font-medium' }).closest('li')!

it('lists the daemon itself and each joined computer as equal machines, each with a labelled Settings', () => {
  render(<MachinesList daemonId="hub" url="https://hub.example" />)
  const hub = within(row('nas'))
  expect(hub.getByText('this daemon')).toBeInTheDocument()
  expect(row('nas').textContent).toContain('v0.1.67 · 2 sessions')
  expect(row('nas').textContent).toContain('New sessions in /home/me')
  expect(hub.getByRole('link', { name: 'Settings of nas' })).toHaveAttribute('data-node', '')
  expect(hub.queryByRole('button', { name: /More for/ })).toBeNull() // the daemon itself cannot be removed
  const mac = within(row('mac'))
  expect(row('mac').textContent).toContain('v0.1.66 · 9 sessions')
  expect(row('mac').textContent).toContain('New sessions in /Users/me/workspace')
  expect(mac.getByRole('link', { name: 'Settings of mac' })).toHaveAttribute('data-node', 'mac')
  expect(row('mac').textContent).toContain('pipx install --force muxtower==0.1.67') // its update, under it
  expect(within(row('old')).queryByRole('link', { name: /Settings/ })).toBeNull() // offline: nothing to set
  expect(row('old').textContent).toContain('offline since')
  expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull() // never a bare Remove beside Settings
})

it('removes a computer only from its ⋯ menu, after a confirm that can be cancelled', async () => {
  const { unmount } = render(<MachinesList daemonId="hub" url="https://hub.example" />)
  let more = screen.getByRole('button', { name: 'More for mac' })
  more.focus()
  fireEvent.keyDown(more, { key: 'Enter' })
  fireEvent.click(await screen.findByRole('menuitem', { name: /Remove mac/ }))
  const confirm = screen.getByRole('alertdialog', { name: 'Remove mac?' })
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(removeNode).not.toHaveBeenCalled()
  unmount()
  render(<MachinesList daemonId="hub" url="https://hub.example" />)
  more = screen.getByRole('button', { name: 'More for mac' })
  more.focus()
  fireEvent.keyDown(more, { key: 'Enter' })
  fireEvent.click(await screen.findByRole('menuitem', { name: /Remove mac/ }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove mac' }))
  expect(removeNode).toHaveBeenCalledWith('mac')
})
