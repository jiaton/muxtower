import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sources } from './sources'

describe('Sources', () => {
  it('names each place a session can come from', () => {
    render(<Sources />)
    for (const name of ['tmux', 'Claude desktop and Remote Control', 'The Codex app', 'Any terminal agent'])
      expect(screen.getByText(name)).toBeInTheDocument()
  })
})
