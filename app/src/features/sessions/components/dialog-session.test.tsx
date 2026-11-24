import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { PendingActionCard } from '@/features/approval/components/pending-action-card'
import type { PendingAction, Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import { addDaemon, wrapper } from '@/test/render'
import { SessionHeader } from './session-header'
import { SessionListRow } from './session-list-row'

// A Claude Code dialog muxtower knows only as one (made-up session): its title is the detail.
const pending: PendingAction = {
  state: 'needs_answer',
  kind: 'dialog',
  sender: null,
  detail: 'Resume this conversation?',
  tool_name: null,
  recommended: null,
  questions: [],
  options: [
    { key: '1', label: 'Resume' },
    { key: '2', label: 'Start a new conversation' },
  ],
}
const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const session = {
  id: 's1',
  name: 'Plan the launch',
  runtime: 'claude-code',
  cwd: '/home/me/projects/web',
  source: 'launched',
  machine: 'hub',
  state: 'needs_answer',
  needs_attention: true,
  pending,
  notify: 'all',
  capabilities: {},
  updated_at: '2026-11-01T10:00:00Z',
} as unknown as Session

function renderRouted(node: ReactNode) {
  const root = createRootRoute({ component: () => node })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
}

describe('a session waiting on a Claude Code dialog', () => {
  it('says so in its row, with the dialog’s title', async () => {
    renderRouted(<SessionListRow entry={{ key: 'd1/s1', daemon, session }} />)
    expect(await screen.findByText('Waiting on a Claude Code dialog: Resume this conversation?')).toBeInTheDocument()
  })

  it('says so in its header badge', async () => {
    renderRouted(<SessionHeader daemonId="d1" session={session} />)
    expect(await screen.findByText('In a dialog')).toBeInTheDocument()
    expect(screen.queryByText('Has a question')).toBeNull()
  })

  it('shows the dialog’s title and its choices, and Esc as a key, not as Deny', () => {
    const { id } = addDaemon()
    const Wrapper = wrapper()
    render(
      <Wrapper>
        <PendingActionCard daemonId={id} sessionId="s1" pending={pending} />
      </Wrapper>,
    )
    expect(screen.getByText('Waiting on a Claude Code dialog')).toBeInTheDocument()
    expect(screen.getByText('Resume this conversation?')).toBeInTheDocument()
    expect(screen.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Resume',
      'Start a new conversation',
      'Esc',
    ])
  })

  it('without choices on screen, points at the screen', () => {
    const { id } = addDaemon()
    const Wrapper = wrapper()
    render(
      <Wrapper>
        <PendingActionCard daemonId={id} sessionId="s1" pending={{ ...pending, options: [], detail: null }} />
      </Wrapper>,
    )
    expect(screen.getByText('Waiting on a Claude Code dialog')).toBeInTheDocument()
    expect(screen.getByText('Answer it on the screen, with the keys there.')).toBeInTheDocument()
  })
})
