import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { frameAt } from '../model/player'
import { MachineStrip } from './machine-strip'

describe('MachineStrip', () => {
  it('shows each machine with one state mark per agent', () => {
    render(<MachineStrip world={frameAt(0).world} />)
    expect(screen.getByText('macbook')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Working' })).toHaveLength(2)
  })
})
