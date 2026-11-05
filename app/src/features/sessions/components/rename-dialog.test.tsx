import { fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { RenameDialog, suggestions } from './rename-dialog'

const session = { id: 's1', name: 'Release worker', agent_name: 'Fix the build', runtime: 'claude-code' } as Session

function renderDialog() {
  const daemon = addDaemon()
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RenameDialog daemonId={daemon.id} session={session} onClose={() => {}} />
    </Wrapper>,
  )
}

it('offers every name the session went by, and takes one with a tap', async () => {
  server.use(
    http.get(`${DAEMON_URL}/v1/sessions/s1/names`, () =>
      HttpResponse.json([
        { name: 'Fix the build', source: 'claude', last_seen: '2026-11-04T09:00:00Z' },
        { name: 'Release notes', source: 'remote control', last_seen: '2026-11-03T09:00:00Z' },
      ]),
    ),
  )
  renderDialog()
  await screen.findByText('Remote Control title', { exact: false }) // loaded (till then: the agent's name)
  const list = screen.getByRole('region', { name: 'Other names' })
  expect(list).toHaveTextContent("Claude's title")
  expect(list).toHaveTextContent('Remote Control title')
  fireEvent.click(screen.getByRole('button', { name: /Release notes/ }))
  expect(screen.getByRole('textbox', { name: 'Session name' })).toHaveValue('Release notes')
  expect(screen.queryByRole('button', { name: /Release notes/ })).toBeNull() // that is what is typed now
})

it("offers the agent's name when an older daemon keeps no names", async () => {
  server.use(http.get(`${DAEMON_URL}/v1/sessions/s1/names`, () => new HttpResponse(null, { status: 404 })))
  renderDialog()
  fireEvent.click(await screen.findByRole('button', { name: /Fix the build/ }))
  expect(screen.getByRole('textbox', { name: 'Session name' })).toHaveValue('Fix the build')
})

it('leaves out what is typed, and shows an unknown source as it is', () => {
  const names = [
    { name: 'a', source: 'muxtower', last_seen: '2026-11-04T09:00:00Z' },
    { name: 'b', source: 'something new', last_seen: '2026-11-04T08:00:00Z' },
  ]
  expect(suggestions(session, names, 'a').map((s) => [s.name, s.from])).toEqual([['b', 'something new']])
  expect(suggestions(session, [], 'x')).toEqual([]) // the daemon keeps names and has none: none
})
