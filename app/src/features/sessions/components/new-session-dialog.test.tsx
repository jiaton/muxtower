import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { NewSessionDialog, type NewSessionPreset } from './new-session-dialog'

/** The dialog open on a daemon whose default folder is ~/projects; what Start sends is collected. */
function show(preset?: (daemonId: string) => NewSessionPreset) {
  const sent: Record<string, unknown>[] = []
  server.use(
    http.get(`${DAEMON_URL}/v1/me`, () => HttpResponse.json({ token_name: 'phone', daemon_name: 'box', default_folder: '~/projects' })),
    http.get(`${DAEMON_URL}/v1/runtimes`, () =>
      HttpResponse.json([{ name: 'claude-code', binary: 'claude', available: true, headless: false }]),
    ),
    http.get(`${DAEMON_URL}/v1/nodes`, () => HttpResponse.json([])),
    http.post(`${DAEMON_URL}/v1/sessions`, async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ id: 'new1', name: 'new1' })
    }),
  )
  const daemon = addDaemon()
  const root = createRootRoute({ component: () => <NewSessionDialog open preset={preset?.(daemon.id)} trigger={<span />} /> })
  const router = createRouter({ routeTree: root, history: createMemoryHistory() })
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RouterProvider router={router} />
    </Wrapper>,
  )
  return sent
}

it('starts with an empty folder, the default shown in its place, and starts there when left empty', async () => {
  const sent = show()
  const folder = await screen.findByRole('combobox')
  await waitFor(() => expect(folder).toHaveAttribute('placeholder', 'Default: ~/projects'))
  expect(folder).toHaveValue('')
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]).toMatchObject({ cwd: null, runtime: 'claude-code' })
})

it('a preset fills the folder, and starts there, the name field focused', async () => {
  const sent = show((daemonId) => ({ daemonId, node: null, cwd: '/home/me/code/shop' }))
  const folder = await screen.findByRole('combobox')
  expect(folder).toHaveValue('/home/me/code/shop')
  expect(screen.getByRole('textbox', { name: /Name/ })).toHaveFocus()
  expect(screen.queryByText(/Role in/)).toBeNull() // no project: nothing to join
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]).toMatchObject({ cwd: '/home/me/code/shop' })
})
