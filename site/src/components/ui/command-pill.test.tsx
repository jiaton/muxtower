import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommandPill } from './command-pill'

describe('CommandPill', () => {
  it('shows the command with a way to copy it', () => {
    render(<CommandPill command="pipx install muxtower" />)
    expect(screen.getByText('pipx install muxtower')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy the commands' })).toBeInTheDocument()
  })
})
