import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { ProjectMenu } from './project-sort'

let role: string | null = null
const puts: unknown[] = []
beforeEach(() => {
  role = 'lead'
  puts.length = 0
  addDaemon()
  server.use(
    http.get(`${DAEMON_URL}/v1/project-colours`, () => HttpResponse.json({ hues: { 'acme/web': 2 } })),
    http.get(`${DAEMON_URL}/v1/projects/*`, () =>
      HttpResponse.json({
        project: 'acme/web',
        roles: [
          { role: 'lead', sessions: 1 },
          { role: 'worker', sessions: 2 },
        ],
        sessions: [],
        default_role: role,
      }),
    ),
    http.put(`${DAEMON_URL}/v1/projects/*`, async ({ request }) => {
      const body = (await request.json()) as { role: string | null }
      puts.push(body)
      role = body.role
      return HttpResponse.json({ role })
    }),
  )
})

async function open() {
  render(<ProjectMenu label="acme/web" />, { wrapper: wrapper() })
  fireEvent.keyDown(screen.getByRole('button', { name: 'More for acme/web' }), { key: 'Enter' })
  fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Default hand-off role…' }))
  return screen.findByRole('dialog', { name: 'Default hand-off role' })
}

it('a project header’s ⋯ sets the default hand-off role, offering the roles held now', async () => {
  const dialog = await open()
  await waitFor(() => expect(within(dialog).getByRole('textbox')).toHaveValue('lead'))
  fireEvent.click(within(dialog).getByRole('button', { name: 'worker' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(puts).toEqual([{ role: 'worker' }]))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('clears it', async () => {
  const dialog = await open()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Clear' }))
  await waitFor(() => expect(puts).toEqual([{ role: null }]))
})
