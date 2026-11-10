import { fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import type { ShownOutgoing } from '@/lib/outbox'
import { addDaemon, wrapper } from '@/test/render'
import { DAEMON_URL, server } from '@/test/server'
import { ConversationView } from './conversation-view'

const outgoing = (id: string, text: string, state: ShownOutgoing['state']): ShownOutgoing => ({
  id, text, state, sentAt: 0, afterSeq: 1, sending: state === 'sending',
}) // prettier-ignore

it('shows what was sent and is not in the conversation yet at its end, and lets an unconfirmed one go', () => {
  const dismiss = vi.fn()
  render(
    <ConversationView
      items={[{ seq: 1, kind: 'reply', text: 'Which day?' }]}
      pending={[outgoing('a', 'Friday', 'sending'), outgoing('b', 'or Saturday', 'unconfirmed')]}
      onDismiss={dismiss}
    />,
  )
  const log = screen.getByRole('log', { name: 'Conversation' })
  expect(log.textContent).toMatch(/Which day\?.*Friday.*Sending.*or Saturday.*not in the conversation yet/)
  expect(log.querySelectorAll('[data-outgoing]')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(dismiss).toHaveBeenCalledWith('b')
})

it('says a message is queued while the agent works, and offers to send again one that did not go in', () => {
  const resend = vi.fn()
  const dismiss = vi.fn()
  render(
    <ConversationView
      items={[{ seq: 1, kind: 'reply', text: 'Running the tests.' }]}
      pending={[outgoing('a', 'then deploy', 'queued'), outgoing('b', 'and tag it', 'undelivered')]}
      onDismiss={dismiss}
      onResend={resend}
    />,
  )
  const log = screen.getByRole('log', { name: 'Conversation' })
  expect(log.textContent).toMatch(/then deploy.*Queued · goes in at the agent’s next step.*and tag it.*Not delivered/)
  expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(1) // not the queued one
  fireEvent.click(screen.getByRole('button', { name: 'Resend' }))
  expect(resend).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', text: 'and tag it' }))
})

it("offers the agent's next step as buttons that send its replies, until something is on its way", () => {
  const reply = vi.fn()
  const items = [
    { seq: 1, kind: 'next_step' as const, text: 'Read the take-home.', ask: 'Start on it?', status: 'pending' as const,
      actions: [{ label: 'Start', message: 'Start on a branch.' }, { label: 'Not now', message: 'Not now.' }] },
    { seq: 2, kind: 'reply' as const, text: 'Done reading.' },
  ] // prettier-ignore
  const { rerender } = render(<ConversationView items={items} onReply={reply} />)
  const card = screen.getByRole('region', { name: 'Next step' })
  expect(card.textContent).toMatch(/Read the take-home\..*Start on it\?/)
  fireEvent.click(screen.getByRole('button', { name: 'Start' }))
  expect(reply).toHaveBeenCalledWith('Start on a branch.')
  rerender(<ConversationView items={items} onReply={reply} pending={[outgoing('a', 'Start on a branch.', 'sending')]} />)
  expect(screen.queryByRole('region', { name: 'Next step' })).toBeNull()
})

it('shows the images items show under them, a tool run’s even while it is folded', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:shot')
  URL.revokeObjectURL = vi.fn()
  const daemon = addDaemon()
  server.use(
    http.get(
      `${DAEMON_URL}/v1/sessions/s1/image`,
      () => new HttpResponse(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }),
    ),
  )
  const items = [
    { seq: 1, kind: 'tool' as const, tool_name: 'SendUserFile', text: '{"files": ["/srv/a.png"]}', images: ['/srv/a.png'] },
    { seq: 2, kind: 'reply' as const, text: 'Before and after: /srv/b.png', images: ['/srv/b.png'] },
  ] // prettier-ignore
  render(<ConversationView items={items} source={{ daemonId: daemon.id, sessionId: 's1' }} />, { wrapper: wrapper() })
  expect(await screen.findByRole('img', { name: 'a.png' })).toBeTruthy()
  expect(await screen.findByRole('img', { name: 'b.png' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /a\.png/ }))
  expect(await screen.findByRole('dialog', { name: 'a.png' })).toBeTruthy()
})
