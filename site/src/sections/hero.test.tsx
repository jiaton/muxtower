import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { config } from '@/config'
import { Hero } from './hero'

describe('Hero', () => {
  it('says what it is, how to install it, and plays the demo', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Every machine. Every agent. One list.')
    expect(screen.getByText('pipx install muxtower')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /Try the live demo/ })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/demo/')
    expect(screen.getByRole('region', { name: 'muxtower demo' })).toBeInTheDocument()
  })

  it('links the hosted app beside the demo when the build names one', () => {
    expect(render(<Hero />).queryByRole('link', { name: /Open the app/ })).toBeNull()
    config.appUrl = 'https://app.example'
    render(<Hero />)
    expect(screen.getByRole('link', { name: /Open the app/ })).toHaveAttribute('href', 'https://app.example')
  })
})

afterEach(() => {
  config.appUrl = null
})
