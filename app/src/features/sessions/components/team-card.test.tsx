import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeAll, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import type { SessionEntry } from '../model/facets'
import { TeamCard } from './team-card'

beforeAll(() => {
  // jsdom has no PointerEvent: one that keeps pointerType
  class Pointer extends MouseEvent {
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
  vi.stubGlobal('PointerEvent', Pointer)
})

function members(daemonId: string): SessionEntry[] {
  const daemon = { id: daemonId, name: 'nas', url: DAEMON_URL, token: 'good' } as never
  const s = (id: string, over: Partial<Session>): SessionEntry => ({
    key: `${daemonId}/${id}`,
    daemon,
    session: {
      id, name: id, project: 'acme/muxtower', state: 'idle', needs_attention: false, machine: 'nas',
      cwd: '/home/me/projects/muxtower', updated_at: '2026-11-05T10:00:00Z', ...over,
    } as Session, // prettier-ignore
  })
  return [
    s('research', { team_role: 'research', needs_attention: true, state: 'needs_permission' }),
    s('mac~worker', { name: 'worker', machine: 'mac', cwd: '/Users/me/muxtower' }), // on another device
    s('other', { project: 'ha' }), // another project: not in this team
  ]
}

function show() {
  const daemon = addDaemon()
  const entries = members(daemon.id)
  const clicked = vi.fn()
  const root = createRootRoute({
    component: () => (
      <TeamCard project="acme/muxtower" entries={entries} device="nas">
        <button onClick={clicked}>acme/muxtower</button>
      </TeamCard>
    ),
  })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
  return clicked
}

it('on hover, after a moment: the whole team, on every device, with the last task each was sent', async () => {
  server.use(
    http.get(`${DAEMON_URL}/v1/tasks/latest`, () =>
      HttpResponse.json({
        'mac~worker': {
          id: 1,
          at: '2026-11-05T09:00:00Z',
          from_id: 'research',
          from_label: 'research',
          to_id: 'mac~worker',
          text: 'Add retries to the client.',
          status: 'delivered',
        },
      }),
    ),
  )
  show()
  const row = await screen.findByRole('button', { name: 'acme/muxtower' })
  fireEvent.pointerEnter(row.parentElement!, { pointerType: 'mouse' })
  expect(screen.queryByRole('menu')).toBeNull() // not at once
  const card = await screen.findByRole('menu', {}, { timeout: 2000 })
  expect(within(card).getByText('acme/muxtower · 2 sessions')).toBeInTheDocument()
  expect(within(card).getAllByText('research')).toHaveLength(2) // its name, and its role
  expect(within(card).getByText('no role')).toBeInTheDocument()
  expect(within(card).getByText('· mac')).toBeInTheDocument() // the member on the other device
  expect(await within(card).findByText('Add retries to the client.')).toBeInTheDocument()
  expect(within(card).queryByText('Rename project…')).toBeNull() // actions only when asked for
})

it('a right click shows it with its actions; Rename renames the project for all its sessions', async () => {
  const put: unknown[] = []
  server.use(
    http.put(`${DAEMON_URL}/v1/sessions/:id/team`, async ({ request, params }) => {
      put.push([params.id, await request.json()])
      return HttpResponse.json(members('x')[0].session)
    }),
  )
  show()
  fireEvent.contextMenu(await screen.findByRole('button', { name: 'acme/muxtower' }))
  const card = await screen.findByRole('menu')
  expect(within(card).getByRole('menuitem', { name: 'New session here…' })).toBeInTheDocument()
  fireEvent.click(within(card).getByRole('menuitem', { name: 'Rename project…' }))
  const name = await screen.findByRole('textbox', { name: 'Project name' })
  fireEvent.change(name, { target: { value: 'muxtower' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
  await waitFor(() => expect(put).toEqual([['research', { project: 'muxtower', rename_project: true }]]))
})

it('a long press shows it too, and the row does not open', async () => {
  const clicked = show()
  const row = await screen.findByRole('button', { name: 'acme/muxtower' })
  vi.useFakeTimers()
  fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 10, clientY: 10 })
  act(() => vi.advanceTimersByTime(600))
  fireEvent.pointerUp(row, { pointerType: 'touch' })
  fireEvent.click(row)
  vi.useRealTimers()
  expect(await screen.findByRole('menuitem', { name: 'Rename project…' })).toBeInTheDocument()
  expect(clicked).not.toHaveBeenCalled()
})

it('a short tap opens the row as before', async () => {
  const clicked = show()
  const row = await screen.findByRole('button', { name: 'acme/muxtower' })
  fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 10, clientY: 10 })
  fireEvent.pointerUp(row, { pointerType: 'touch' })
  fireEvent.click(row)
  expect(clicked).toHaveBeenCalledOnce()
  expect(screen.queryByRole('menu')).toBeNull()
})

it('"New session here…" starts one in the project’s folder, with a role to give it', async () => {
  show()
  fireEvent.contextMenu(await screen.findByRole('button', { name: 'acme/muxtower' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'New session here…' }))
  expect(await screen.findByText(/Role in acme\/muxtower/)).toBeInTheDocument()
  expect(screen.getByDisplayValue('/home/me/projects/muxtower')).toBeInTheDocument()
})
