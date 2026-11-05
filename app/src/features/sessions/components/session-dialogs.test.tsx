import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { SessionActions } from './session-actions'

const base = {
  id: 's1', name: 'Release notes', runtime: 'claude-code', source: 'remote_control', origin: 'claude_desktop',
  state: 'idle', needs_attention: false, notify: 'all', updated_at: '2026-11-04T10:00:00Z',
} // prettier-ignore
const caps = { screen: false, conversation: true, keys: [], resize: false, terminate: false, rename: true, archive: true }

function renderActions(session: Session) {
  const daemon = addDaemon()
  const root = createRootRoute({
    component: () => (
      <SessionActions daemonId={daemon.id} session={session}>
        {(actions) => (
          <div>
            {actions.map((a) => (
              <button key={a.id} onClick={a.run}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </SessionActions>
    ),
  })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
}

function watchRequests() {
  const asked: { path: string; body: unknown }[] = []
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/:action`, async ({ request, params }) => {
      asked.push({ path: String(params.action), body: await request.json().catch(() => null) })
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return asked
}

it('a session in the desktop app is hidden, not archived, and the dialog says why', async () => {
  const asked = watchRequests()
  renderActions({ ...base, capabilities: { ...caps, archive_ends: false } } as unknown as Session)
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
  expect(await screen.findByText(/runs in Claude's desktop app, which muxtower cannot end/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
  await waitFor(() => expect(asked).toEqual([{ path: 'hide', body: { hidden: true } }])) // never /archive
})

it('a session muxtower can end is archived as before', async () => {
  const asked = watchRequests()
  renderActions({ ...base, tmux_pane: '%1', capabilities: { ...caps, archive_ends: true } } as unknown as Session)
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
  expect(await screen.findByText(/This ends the agent/)).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!)
  await waitFor(() => expect(asked.map((a) => a.path)).toEqual(['archive']))
})
