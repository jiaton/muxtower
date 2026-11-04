import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sources } from './sources'

describe('Sources', () => {
  it('says how desktop sessions reach muxtower, and its limit', () => {
    render(<Sources />)
    expect(screen.getByRole('heading', { name: /Start at your desk/ })).toBeInTheDocument()
    expect(screen.getByText('remote_control.enabled')).toBeInTheDocument()
    expect(screen.getByText(/private API/)).toBeInTheDocument()
  })

  it('names each place a session can come from', () => {
    render(<Sources />)
    for (const name of ['tmux', 'Claude desktop and Remote Control', 'The Codex app', 'Any terminal agent'])
      expect(screen.getByText(name)).toBeInTheDocument()
  })
})
