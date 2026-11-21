import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import { wrapper } from '@/test/render'
import { SessionHeader } from './session-header'

// Made-up session: every field the details list says.
const base = {
  id: 'sess-1234',
  name: 'Plan the launch',
  state: 'idle',
  runtime: 'claude-code',
  source: 'launched',
  cwd: '/home/me/projects/shop',
  machine: 'build-box',
  team_role: 'worker — the billing page and its tests',
  team_note: 'reports to the lead',
  project: 'acme/shop',
  project_source: 'git remote',
  project_auto: true,
  permission_mode: 'default',
  remote_id: 'remote-5678',
  git: { remote: 'acme/shop', repo: '/home/me/projects/shop', worktree: '/home/me/projects/shop-billing', branch: 'billing' },
  created_at: '2026-11-01T08:00:00Z',
  updated_at: '2026-11-02T09:00:00Z',
  output_at: '2026-11-02T09:00:00Z',
  capabilities: {},
} as unknown as Session

const real = window.matchMedia
afterEach(() => {
  window.matchMedia = real
})

function phone() {
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia // prettier-ignore
}

function renderHeader(session: Session) {
  const root = createRootRoute({ component: () => <SessionHeader daemonId="d1" session={session} /> })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
}

const tag = (key: string) => document.querySelector(`[data-tag="${key}"]`)

describe('the session header', () => {
  it('shows the role’s name, the project and the machine as three tags, each with a tooltip', async () => {
    renderHeader(base)
    await screen.findByRole('heading', { name: 'Plan the launch' })
    const tags = [...document.querySelectorAll('[data-tag]')]
    expect(tags.map((t) => t.textContent)).toEqual(['worker', 'acme/shop', 'build-box'])
    expect(tag('role')).toHaveAttribute('title', 'worker — the billing page and its tests')
    expect(tag('project')).toHaveAttribute('title', 'Project: acme/shop')
    expect(tag('machine')).toHaveAttribute('title', 'Machine: build-box')
    expect(screen.getByRole('button', { name: 'Session details' })).toBeInTheDocument()
  })

  it('leaves out a tag it has nothing for, with no placeholder', async () => {
    renderHeader({ ...base, team_role: null, project: null, machine: null, cwd: '' } as Session)
    await screen.findByRole('heading', { name: 'Plan the launch' })
    expect(document.querySelectorAll('[data-tag]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Session details' })).toBeInTheDocument()
  })

  it('opens every detail from the ⓘ, the usual values too', async () => {
    renderHeader(base)
    fireEvent.click(await screen.findByRole('button', { name: 'Session details' }))
    const details = await screen.findByRole('dialog', { name: 'Session details' })
    const pairs = [...details.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
    const values = Object.fromEntries(pairs)
    expect(values).toMatchObject({
      Role: 'worker — the billing page and its tests',
      Note: 'reports to the lead',
      Project: 'acme/shop',
      'Project from': 'git remote (worked out by muxtower)',
      Machine: 'build-box',
      Agent: 'Claude Code',
      Folder: '~/projects/shop',
      'Permission mode': 'default',
      'Started by': 'muxtower',
      Repository: 'acme/shop',
      Branch: 'billing',
      Worktree: '~/projects/shop-billing',
      'Session id': 'sess-1234',
      'Remote id': 'remote-5678',
    })
    expect(values.Created).toContain('2026')
    expect(values['Last activity']).toContain('2026')
  })

  it('copies the folder, the session id and the remote id', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderHeader(base)
    fireEvent.click(await screen.findByRole('button', { name: 'Session details' }))
    const details = await screen.findByRole('dialog', { name: 'Session details' })
    for (const [label, text] of [
      ['Copy the folder', '/home/me/projects/shop'],
      ['Copy the session id', 'sess-1234'],
      ['Copy the remote id', 'remote-5678'],
    ]) {
      fireEvent.click(within(details).getByRole('button', { name: label }))
      await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(text))
    }
    await waitFor(() => expect(within(details).getAllByRole('button', { name: 'Copied' }).length).toBeGreaterThan(0))
    vi.unstubAllGlobals()
  })

  it('opens the same details as a sheet on a phone', async () => {
    phone()
    renderHeader(base)
    fireEvent.click(await screen.findByRole('button', { name: 'Session details' }))
    const sheet = await screen.findByRole('dialog', { name: 'Session details' })
    expect(within(sheet).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(sheet).toHaveTextContent('Permission mode')
    expect(sheet).toHaveTextContent('sess-1234')
  })
})
