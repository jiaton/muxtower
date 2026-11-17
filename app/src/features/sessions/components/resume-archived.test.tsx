import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { SessionActions } from './session-actions'

const archived = {
  id: 's1', name: 'Fix the build', runtime: 'claude-code', source: 'launched', machine: 'nas', cwd: '/srv/app',
  state: 'idle', needs_attention: false, notify: 'all', updated_at: '2026-11-04T10:00:00Z', archived_at: '2026-11-05T10:00:00Z',
  capabilities: { screen: false, conversation: true, keys: [], resize: false, terminate: true, rename: false, resume: true },
  resume_blocked: null,
} // prettier-ignore

function renderActions(session: Session) {
  const daemon = addDaemon()
  const root = createRootRoute({
    component: () => (
      <SessionActions daemonId={daemon.id} session={session}>
        {(actions) => (
          <div>
            {actions.map((a) => (
              <button key={a.id} onClick={a.run} disabled={Boolean(a.disabled)} title={a.disabled}>
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

function watchResume(reply: () => Response = () => HttpResponse.json(archived)) {
  const asked: unknown[] = []
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/resume`, async ({ request }) => {
      asked.push(await request.json().catch(() => null))
      return reply()
    }),
  )
  return asked
}

it('an archived session can be resumed, said first: where, and that its conversation goes on', async () => {
  const asked = watchResume()
  renderActions(archived as unknown as Session)
  fireEvent.click(await screen.findByRole('button', { name: 'Resume' }))
  expect(await screen.findByText(/starts again on nas in \/srv\/app, its conversation where it left off/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
  await waitFor(() => expect(asked).toEqual([{}]))
})

it('one that cannot be resumed says why, and is not offered', async () => {
  const reason = "muxtower never ran it: it ran in Claude's app or on Remote Control only, so start it there"
  renderActions({
    ...archived,
    capabilities: { ...archived.capabilities, resume: false },
    resume_blocked: { code: 'not_ours', reason },
  } as unknown as Session)
  const resume = await screen.findByRole('button', { name: 'Resume' })
  expect(resume).toBeDisabled()
  expect(resume).toHaveAttribute('title', reason)
})

it('one whose folder is gone asks for another, and starts there', async () => {
  const asked = watchResume()
  renderActions({
    ...archived,
    capabilities: { ...archived.capabilities, resume: false },
    resume_blocked: { code: 'folder', reason: 'its folder /srv/app is gone: pick another' },
  } as unknown as Session)
  fireEvent.click(await screen.findByRole('button', { name: 'Resume' }))
  expect(await screen.findByText('its folder /srv/app is gone: pick another')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Folder to start it in' }), { target: { value: '/srv/app2' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Resume' }).at(-1)!)
  await waitFor(() => expect(asked).toEqual([{ cwd: '/srv/app2' }]))
})

it('why it did not start is said in the dialog', async () => {
  watchResume(() => HttpResponse.json({ detail: "its conversation's transcript is gone from this machine" }, { status: 409 }))
  renderActions(archived as unknown as Session)
  fireEvent.click(await screen.findByRole('button', { name: 'Resume' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Resume' }))
  expect(await screen.findByText(/transcript is gone/)).toBeInTheDocument()
})
