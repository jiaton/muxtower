import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { initialWorld, sessionById } from '../model/world'
import { SessionRow } from './session-row'

describe('SessionRow', () => {
  const world = initialWorld()

  it('says where the session runs and what it said last', () => {
    render(<SessionRow session={sessionById(world, 'research')!} target="r" flash={false} />)
    expect(screen.getByText('research · macbook · shop · Claude desktop')).toBeInTheDocument()
    expect(screen.getByText(/Agreed: retry a charge/)).toBeInTheDocument()
  })

  it('marks a fork, and folds a side chat into one line', () => {
    render(<SessionRow session={sessionById(world, 'fork')!} target="f" flash={false} />)
    expect(screen.getByText('fork')).toBeInTheDocument()
    render(<SessionRow session={sessionById(world, 'side')!} target="s" flash />)
    expect(screen.getByText('1 side chat')).toBeInTheDocument()
  })
})
