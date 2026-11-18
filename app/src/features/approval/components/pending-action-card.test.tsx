import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { PendingAction } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { PendingActionCard } from './pending-action-card'

const held: PendingAction = {
  state: 'needs_permission',
  kind: 'peer_message',
  sender: 'builder-7',
  detail: 'Please rerun the lint step\nand tell me what fails.',
  tool_name: null,
  recommended: null,
  questions: [],
  options: [
    { key: '1', label: 'Deny — drop it and tell the sender it was declined' },
    { key: '2', label: 'Deliver this message to Claude' },
  ],
}

it('a message held from another session: who sent it, what it says, Deliver and Deny, no default', async () => {
  const picked: unknown[] = []
  server.use(
    http.post(`${DAEMON_URL}/v1/sessions/s1/approve`, async ({ request }) => {
      picked.push(await request.json())
      return HttpResponse.json({ session_id: 's1', state: 'needs_permission', option: '2' })
    }),
    http.get(`${DAEMON_URL}/v1/sessions`, () => HttpResponse.json([])),
  )
  const { id } = addDaemon()
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <PendingActionCard daemonId={id} sessionId="s1" pending={held} />
    </Wrapper>,
  )
  expect(screen.getByText('Message from builder-7')).toBeInTheDocument()
  expect(screen.getByText(/Please rerun the lint step/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Deny \(Esc\)/ })).toBeNull() // its own Deny, not Esc
  expect(screen.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Deliver', 'Deny'])
  fireEvent.click(screen.getByRole('button', { name: 'Deliver' }))
  await waitFor(() => expect(picked).toEqual([{ option: '2' }]))
})
