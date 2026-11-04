import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Reach } from './reach'

describe('Reach', () => {
  it('lists the ways to answer', () => {
    render(<Reach />)
    expect(screen.getByText('Reply to a message')).toBeInTheDocument()
    expect(screen.getByText('Push notifications')).toBeInTheDocument()
  })
})
