import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hero } from './hero'

describe('Hero', () => {
  it('says what it is, how to install it, and plays the demo', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Every machine. Every agent. One list.')
    expect(screen.getByText('pipx install muxtower')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /Try the real app/ })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/demo/')
    expect(screen.getByRole('region', { name: 'muxtower demo' })).toBeInTheDocument()
  })
})
