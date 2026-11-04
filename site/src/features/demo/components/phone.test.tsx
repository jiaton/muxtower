import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { frameAt } from '../model/player'
import { Phone } from './phone'

describe('Phone', () => {
  it('shows the notification on the lock screen', () => {
    render(<Phone world={frameAt(5600).world} />)
    expect(screen.getByText('api migrations · vps')).toBeInTheDocument()
  })

  it('offers Reply on a long press and shows what is being typed', () => {
    const menu = render(<Phone world={frameAt(11000).world} />)
    expect(screen.getByRole('button', { name: /Reply/ })).toBeInTheDocument()
    menu.unmount()
    render(<Phone world={frameAt(13800).world} />)
    expect(screen.getByText(/Reply to: Migration 0042/)).toBeInTheDocument()
    expect(screen.getByText(/Yes, staging first/)).toBeInTheDocument()
  })

  it('approves from the lock screen', () => {
    render(<Phone world={frameAt(21500).world} />)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByText('Bash: npm test -- payments')).toBeInTheDocument()
  })

  it('lists sessions, a side chat folded under its parent', () => {
    render(<Phone world={frameAt(28000).world} />)
    expect(screen.getByText('1 side chat')).toBeInTheDocument()
    expect(screen.getByText('fork')).toBeInTheDocument()
  })
})
