import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Install } from './install'

describe('Install', () => {
  it('switches between Tailscale and your own domain', async () => {
    render(<Install />)
    expect(screen.getByText('muxtower expose tailscale')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Your own domain' }))
    expect(screen.getByText('muxtower pair --url https://muxtower.example.com')).toBeInTheDocument()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('links the hosted app, apart from the demo, only when the build names it', async () => {
    expect(screen.queryByRole('link', { name: 'Open the app' })).toBeNull()
    vi.stubEnv('MUXTOWER_SITE_APP_URL', 'https://app.example')
    vi.resetModules()
    const { Install: WithApp } = await import('./install')
    render(<WithApp />)
    expect(screen.getByRole('link', { name: 'Open the app' })).toHaveAttribute('href', 'https://app.example')
    expect(screen.getByText(/Your daemon serves the same app itself/)).toBeInTheDocument()
  })
})

describe('Install, joining', () => {
  it('shows how another machine joins the hub', async () => {
    render(<Install />)
    await userEvent.click(screen.getByRole('tab', { name: 'Join another machine' }))
    expect(screen.getByText('muxtower pair --join https://hub.example --code K7QM-3XPA')).toBeInTheDocument()
  })
})
