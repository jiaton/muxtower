import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, useParams } from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { Continuation, Session } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { ContinueLink } from './continue-dialog'
import { SessionActions } from './session-actions'

const desk = {
  id: 'cse_desk', name: 'Plan the launch', runtime: 'claude-code', source: 'remote_control', origin: 'claude_desktop',
  machine: 'build-box', cwd: '/srv/shop', state: 'idle', needs_attention: false, notify: 'all', unread: false,
  updated_at: '2026-11-04T10:00:00Z',
  capabilities: { screen: false, conversation: true, keys: ['Escape'], resize: false, terminate: false, rename: false,
                  archive: true, archive_ends: false, continue_terminal: true },
  continue_blocked: null,
} as unknown as Session // prettier-ignore

const ready: Continuation = { step: 'ready', reason: null, machine: 'build-box', session_id: null, retry: false }

function renderWith(element: (daemonId: string) => React.ReactNode) {
  const daemon = addDaemon()
  const root = createRootRoute({ component: () => <Outlet /> })
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => element(daemon.id) })
  const opened = createRoute({
    getParentRoute: () => root,
    path: '/d/$daemonId/s/$sessionId',
    component: function Opened() {
      return <p>opened {useParams({ strict: false }).sessionId}</p>
    },
  })
  const router = createRouter({ routeTree: root.addChildren([home, opened]), history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
}

function renderActions(session: Session) {
  renderWith((daemonId) => (
    <SessionActions daemonId={daemonId} session={session}>
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
  ))
}

/** The daemon's side: what GET says (in turn, the last one kept), and POST's answer, once `release` lets it. */
function daemon(checks: Continuation[], answer: () => Response) {
  const posted: number[] = []
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions/cse_desk/continue`, () => HttpResponse.json(checks.length > 1 ? checks.shift() : checks[0])),
    http.post(`${DAEMON_URL}/v1/sessions/cse_desk/continue`, async () => {
      posted.push(1)
      await held
      return answer()
    }),
  )
  return { posted, release }
}

it('a Claude-app session offers Continue in terminal; one that cannot now says why; others do not', async () => {
  renderActions(desk)
  expect(await screen.findByRole('button', { name: 'Continue in terminal' })).toBeEnabled()
})

it('the menu item says why it cannot be continued now', async () => {
  renderActions({ ...desk, continue_blocked: "Wait until it's idle: it is in the middle of a turn" } as Session)
  const item = await screen.findByRole('button', { name: 'Continue in terminal' })
  expect(item).toBeDisabled()
  expect(item).toHaveAttribute('title', "Wait until it's idle: it is in the middle of a turn")
})

it('a session the daemon does not offer it for has no such item', async () => {
  renderActions({ ...desk, capabilities: { ...desk.capabilities, continue_terminal: false } } as Session)
  await screen.findByRole('button', { name: 'Team' })
  expect(screen.queryByRole('button', { name: 'Continue in terminal' })).toBeNull()
})

it('it says what happens, shows its progress, then opens the pane session', async () => {
  const closing = { ...ready, step: 'closing' } as Continuation
  const starting = { ...ready, step: 'starting' } as Continuation
  const { posted, release } = daemon([ready, closing, starting], () =>
    HttpResponse.json({ ...ready, step: 'done', session_id: 'build-box-pane' }),
  )
  renderActions(desk)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue in terminal' }))
  expect(await screen.findByText(/closes in the Claude app \(and on claude.ai and your phone\), then goes on in a terminal on build-box/)).toBeInTheDocument()
  const run = await screen.findAllByRole('button', { name: 'Continue in terminal' })
  await waitFor(() => expect(run.at(-1)).toBeEnabled())
  fireEvent.click(run.at(-1)!)
  expect(await screen.findByText('Closing it in the Claude app…')).toBeInTheDocument()
  expect(await screen.findByText('Starting it here…', {}, { timeout: 3000 })).toBeInTheDocument()
  await act(async () => release())
  expect(await screen.findByText('opened build-box-pane')).toBeInTheDocument()
  expect(posted).toEqual([1])
})

it('when its transcript is not there, the dialog says so and does not run it', async () => {
  const { posted } = daemon([{ ...ready, step: 'blocked', reason: 'Its transcript is not on build-box' }], () => HttpResponse.json(ready))
  renderActions(desk)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue in terminal' }))
  expect(await screen.findByText('Its transcript is not on build-box')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Continue in terminal' }).at(-1)).toBeDisabled()
  expect(posted).toEqual([])
})

it('a pane that did not start is said so, with Retry', async () => {
  const why = 'It is closed in the Claude app, but did not start on build-box: claude exited as it started'
  const failed = { ...ready, step: 'failed', reason: why, retry: true } as Continuation
  const { posted, release } = daemon([ready], () => HttpResponse.json(failed))
  release()
  renderActions(desk)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue in terminal' }))
  const run = await screen.findAllByRole('button', { name: 'Continue in terminal' })
  await waitFor(() => expect(run.at(-1)).toBeEnabled())
  fireEvent.click(run.at(-1)!)
  expect(await screen.findByText(why)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(posted).toEqual([1, 1]))
})

it('a refusal before anything was done is said in the dialog', async () => {
  const { release } = daemon([ready], () => HttpResponse.json({ detail: 'build-box is offline' }, { status: 409 }))
  release()
  renderActions(desk)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue in terminal' }))
  const run = await screen.findAllByRole('button', { name: 'Continue in terminal' })
  await waitFor(() => expect(run.at(-1)).toBeEnabled())
  fireEvent.click(run.at(-1)!)
  expect(await screen.findByText('build-box is offline')).toBeInTheDocument()
})

it('the message box note of a Claude-app session links to it', async () => {
  daemon([ready], () => HttpResponse.json(ready))
  renderWith((daemonId) => <ContinueLink daemonId={daemonId} session={desk} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue in terminal' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})
