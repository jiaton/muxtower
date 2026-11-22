import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { useComposerHistory } from '@/lib/composer-history'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { SessionActionsMenu } from './session-actions-menu'
import { DeleteDialog } from './session-dialogs'

// Made-up session on screen, as the session page shows it.
const base = {
  id: 's1', name: 'Plan the launch', runtime: 'claude-code', source: 'launched', machine: 'build-box', cwd: '/srv/app',
  state: 'busy', needs_attention: false, notify: 'all', unread: false, updated_at: '2026-11-04T10:00:00Z',
  capabilities: { screen: true, conversation: true, keys: [], resize: true, terminate: true, rename: true, archive: true },
} // prettier-ignore

function renderMenu(session: Partial<Session>) {
  const daemon = addDaemon()
  const root = createRootRoute({
    component: () => <SessionActionsMenu daemonId={daemon.id} session={{ ...base, ...session } as unknown as Session} />,
  })
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/d/x/s/s1'] }) })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
  return { router, daemon }
}

function watch() {
  const asked: { path: string; body: unknown }[] = []
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/:action`, async ({ request, params }) => {
      asked.push({ path: String(params.action), body: await request.json().catch(() => null) })
      return HttpResponse.json({})
    }),
  )
  return asked
}

const alt = (code: string, key: string) => fireEvent.keyDown(window, { code, key, altKey: true })

it('Alt+I interrupts the agent while it works (Esc, as the menu does), by the key, so Option+I counts', async () => {
  const asked = watch()
  renderMenu({})
  await screen.findByRole('button', { name: 'More actions' })
  alt('KeyI', 'Dead') // Option+I on a Mac: a dead key ("ˆ")
  await waitFor(() => expect(asked).toMatchObject([{ path: 'input', body: { key: 'Escape' } }]))
})

it('Alt+I does nothing while the agent is not working', async () => {
  const asked = watch()
  renderMenu({ state: 'idle' })
  await screen.findByRole('button', { name: 'More actions' })
  alt('KeyI', 'i')
  await new Promise((r) => setTimeout(r, 50))
  expect(asked).toEqual([])
})

it('Alt+R marks the open session unread and goes back to the list, as the menu does', async () => {
  const asked = watch()
  const { router } = renderMenu({ state: 'idle' })
  await screen.findByRole('button', { name: 'More actions' })
  alt('KeyR', '®')
  await waitFor(() => expect(asked).toEqual([{ path: 'read', body: { read: false } }]))
  expect(router.state.location.pathname).toBe('/')
})

it('Alt+R marks an unread one read, staying', async () => {
  const asked = watch()
  const { router } = renderMenu({ state: 'idle', unread: true })
  await screen.findByRole('button', { name: 'More actions' })
  alt('KeyR', 'r')
  await waitFor(() => expect(asked).toEqual([{ path: 'read', body: { read: true } }]))
  expect(router.state.location.pathname).toBe('/d/x/s/s1')
})

it('neither acts inside a dialog', async () => {
  const asked = watch()
  renderMenu({})
  await screen.findByRole('button', { name: 'More actions' })
  const dialog = document.body.appendChild(document.createElement('div'))
  dialog.setAttribute('role', 'dialog')
  alt('KeyI', 'i')
  alt('KeyR', 'r')
  await new Promise((r) => setTimeout(r, 50))
  expect(asked).toEqual([])
  dialog.remove()
})

it('the menu says the shortcuts in the tooltips of Interrupt and Mark as unread', async () => {
  renderMenu({})
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'More actions' }), { button: 0, pointerType: 'mouse' })
  expect(await screen.findByRole('menuitem', { name: /Interrupt/ })).toHaveAttribute('title', 'Interrupt: sends Esc (Alt+I)')
  expect(screen.getByRole('menuitem', { name: /Mark as unread/ })).toHaveAttribute('title', 'Mark as unread (Alt+R)')
  expect(screen.getByRole('menuitem', { name: /Rename/ })).not.toHaveAttribute('title')
})

it("a deleted session's messages sent from this browser go with it", async () => {
  server.use(http.delete(`${DAEMON_URL}/v1/sessions/s1`, () => new HttpResponse(null, { status: 204 })))
  const daemon = addDaemon()
  useComposerHistory.setState({ sent: { [`${daemon.id}/s1`]: ['one'], [`${daemon.id}/s2`]: ['two'] } })
  const session = { ...base, state: 'idle', archived_at: '2026-11-05T10:00:00Z' } as unknown as Session
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <DeleteDialog daemonId={daemon.id} session={session} onClose={() => {}} />
    </Wrapper>,
  )
  fireEvent.click(await screen.findByRole('button', { name: /Delete/ }))
  await waitFor(() => expect(useComposerHistory.getState().sent).toEqual({ [`${daemon.id}/s2`]: ['two'] }))
})
