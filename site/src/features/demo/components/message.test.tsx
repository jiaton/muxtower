import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageItem } from './message'

describe('MessageItem', () => {
  it('puts the quoted part first in a reply', () => {
    render(<MessageItem message={{ id: '1', kind: 'you', text: 'Yes.', quote: 'Run it?' }} />)
    expect(screen.getByText('Run it?')).toBeInTheDocument()
    expect(screen.getByText('Yes.')).toBeInTheDocument()
  })

  it('shows a tool call with its output', () => {
    render(<MessageItem message={{ id: '2', kind: 'tool', tool: 'Bash', text: 'npm test', output: ['Tests: 42 passed'] }} />)
    expect(screen.getByText('Bash')).toBeInTheDocument()
    expect(screen.getByText('Tests: 42 passed')).toBeInTheDocument()
  })

  it('marks the selected part of an agent reply', () => {
    const { container } = render(
      <MessageItem message={{ id: '3', kind: 'agent', text: 'Done. Ship it?' }} target="t" selected="Ship it?" />,
    )
    expect(container.querySelector('mark')).toHaveTextContent('Ship it?')
    expect(container.querySelector('[data-demo="t"]')).toHaveTextContent('Done. Ship it?')
  })
})
