import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { initialWorld, sessionById } from '../model/world'
import { SessionRow } from './session-row'

describe('SessionRow', () => {
  const world = initialWorld()

  it('writes role · machine · repository · source under the name, as the app does', () => {
    render(<SessionRow session={sessionById(world, 'research')!} target="r" flash={false} />)
    expect(screen.getByText('research · macbook · shop · muxtower')).toBeInTheDocument()
  })

  it('folds a side chat into one line', () => {
    render(<SessionRow session={sessionById(world, 'side')!} target="s" flash />)
    expect(screen.getByText(/1 side chat/)).toBeInTheDocument()
    expect(screen.getByText('· 1 unread')).toBeInTheDocument()
  })
})
