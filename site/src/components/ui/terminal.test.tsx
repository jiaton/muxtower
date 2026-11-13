import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Terminal } from './terminal'

vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn(async () => true) }))

describe('Terminal', () => {
  it('copies only the commands, not their output or comments', async () => {
    const { copyText } = await import('@/lib/clipboard')
    render(
      <Terminal
        title="t"
        lines={[
          { kind: 'comment', text: '# hub' },
          { kind: 'command', text: 'muxtower pair' },
          { kind: 'output', text: 'code' },
          { kind: 'command', text: 'muxtower' },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Copy the commands' }))
    expect(copyText).toHaveBeenCalledWith('muxtower pair\nmuxtower')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
