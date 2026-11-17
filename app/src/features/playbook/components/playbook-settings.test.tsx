import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { PlaybookSettings } from './playbook-settings'

const shared = { scope: 'shared', mode: 'add', version: 2, text: '- report once', at: '2026-11-15T10:00:00Z', author: 'phone' }

function serve(put: (body: unknown) => Response) {
  const asked: unknown[] = []
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions`, () => HttpResponse.json([])),
    http.get(`${DAEMON_URL}/v1/playbook`, () => HttpResponse.json({ shared, projects: [], effective: null })),
    http.get(`${DAEMON_URL}/v1/playbook/shared/versions`, () =>
      HttpResponse.json([shared, { ...shared, version: 1, text: '- first', note: null }]),
    ),
    http.put(`${DAEMON_URL}/v1/playbook/shared`, async ({ request }) => {
      const body = await request.json()
      asked.push(body)
      return put(body)
    }),
    http.post(`${DAEMON_URL}/v1/playbook/shared/revert`, async ({ request }) => {
      asked.push(['revert', await request.json()])
      return HttpResponse.json({ ...shared, version: 3, text: '- first' })
    }),
  )
  return asked
}

function show() {
  const daemon = addDaemon()
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <PlaybookSettings daemonId={daemon.id} />
    </Wrapper>,
  )
}

it('saves a new version from the one it started from, and shows what a session reads', async () => {
  const asked = serve(() => HttpResponse.json({ ...shared, version: 3 }))
  show()
  const box = await screen.findByRole('textbox', { name: 'Shared playbook' })
  expect(screen.getByText(/— shared \(v2\) —/)).toBeInTheDocument()
  fireEvent.change(box, { target: { value: '- report once\n- ask before spending' } })
  const preview = document.querySelector('pre')!
  expect(preview.textContent).toContain('— shared (v3) —\n- report once\n- ask before spending') // the draft, as it will read
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(asked).toEqual([{ text: '- report once\n- ask before spending', mode: 'add', base_version: 2 }]))
})

it('says so when another version was saved meanwhile', async () => {
  serve(() => HttpResponse.json({ detail: 'the playbook was changed since (now version 3)' }, { status: 409 }))
  show()
  fireEvent.change(await screen.findByRole('textbox', { name: 'Shared playbook' }), { target: { value: 'mine' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/changed since/)).toBeInTheDocument()
})

it('keeps every version, and a revert saves an old one again', async () => {
  const asked = serve(() => HttpResponse.json(shared))
  show()
  expect(await screen.findByText('Current')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
  await waitFor(() => expect(asked).toEqual([['revert', { version: 1 }]]))
})
