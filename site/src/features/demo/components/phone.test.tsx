import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { frameAt } from '../model/player'
import { Phone } from './phone'

describe('Phone', () => {
  it('shows a notification the way the daemon writes it', () => {
    render(<Phone world={frameAt(4500).world} />)
    expect(screen.getByText(/^Done: Migration 0042/)).toBeInTheDocument()
    expect(screen.getByText('vps · ~/code/api')).toBeInTheDocument()
  })

  it('offers Copy and Reply on selected text, then quotes it above the message box', () => {
    const selected = render(<Phone world={frameAt(9600).world} />)
    expect(screen.getByRole('button', { name: /Reply/ })).toBeInTheDocument()
    selected.unmount()
    render(<Phone world={frameAt(12600).world} />)
    expect(screen.getAllByText('Run it on staging first?').length).toBeGreaterThan(0)
    expect(screen.getByText(/Yes, staging first/)).toBeInTheDocument()
  })

  it('approves inside the session, not on the lock screen', () => {
    const lock = render(<Phone world={frameAt(25500).world} />)
    expect(screen.getByText('Approve Bash: npm test -- payments')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Yes/ })).toBeNull()
    lock.unmount()
    render(<Phone world={frameAt(27000).world} />)
    expect(screen.getByRole('button', { name: /don't ask again/ })).toBeInTheDocument()
  })

  it('lists a fork under its parent and folds its side chat', () => {
    render(<Phone world={frameAt(34000).world} />)
    expect(screen.getByText(/1 side chat/)).toBeInTheDocument()
    expect(screen.getAllByText('Release notes 2.4')).toHaveLength(2)
  })
  it('keeps working while the hub is down, and says so', () => {
    render(<Phone world={frameAt(41000).world} />)
    expect(screen.getByText(/^nas unreachable · direct to/)).toBeInTheDocument()
    expect(screen.getByText('Merge it once CI is green.')).toBeInTheDocument()
  })
})
