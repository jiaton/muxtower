import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageItem } from './message'

describe('MessageItem', () => {
  it('shows the message a reply quotes', () => {
    render(<MessageItem message={{ id: '1', kind: 'you', text: 'Yes.', quote: 'Run it?' }} />)
    expect(screen.getByText('Run it?')).toBeInTheDocument()
    expect(screen.getByText('Yes.')).toBeInTheDocument()
  })

  it('shows a tool call or task with its status', () => {
    render(<MessageItem message={{ id: '2', kind: 'task', text: 'send_task(to: "worker")', status: 'queued' }} />)
    expect(screen.getByText('queued')).toBeInTheDocument()
  })

  it('marks an agent reply for the cursor', () => {
    const { container } = render(<MessageItem message={{ id: '3', kind: 'agent', text: 'Done.' }} target="t" />)
    expect(container.querySelector('[data-demo="t"]')).toHaveTextContent('Done.')
  })
})
