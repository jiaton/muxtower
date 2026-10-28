import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ShownOutgoing } from '@/lib/outbox'
import { ConversationView } from './conversation-view'

const outgoing = (id: string, text: string, state: ShownOutgoing['state']): ShownOutgoing => ({
  id, text, state, sentAt: 0, afterSeq: 1, sending: state === 'sending',
})  // prettier-ignore

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
