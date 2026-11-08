import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DemoCta, appUrl } from './cta'

afterEach(() => document.head.querySelector('meta[name="muxtower-app-url"]')?.remove())

describe('demo call to action', () => {
  it('reads the hosted app from the page, and offers nothing without one', () => {
    expect(appUrl()).toBeNull()
    const meta = document.createElement('meta')
    meta.name = 'muxtower-app-url'
    meta.content = 'https://app.example'
    document.head.append(meta)
    expect(appUrl()).toBe('https://app.example')
  })

  it('links to the app for your own daemon and hides when asked', () => {
    render(<DemoCta url="https://app.example" />)
    expect(screen.getByRole('link', { name: /Connect your own daemon/ })).toHaveAttribute('href', 'https://app.example')
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('complementary', { name: 'About this demo' })).toBeNull()
  })

  it('steps aside while the message box has the focus, so the lists above it show', () => {
    const box = document.createElement('textarea')
    document.body.append(box)
    render(<DemoCta url="https://app.example" />)
    act(() => box.focus())
    expect(screen.queryByRole('complementary', { name: 'About this demo' })).toBeNull()
    act(() => box.blur())
    expect(screen.getByRole('complementary', { name: 'About this demo' })).toBeInTheDocument()
    box.remove()
  })
})
