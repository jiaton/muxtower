import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Hub } from './hub'

describe('Hub', () => {
  it('shows how a machine joins the hub', () => {
    render(<Hub />)
    expect(screen.getByRole('heading', { name: /One hub/ })).toBeInTheDocument()
    expect(screen.getByText('muxtower pair --join https://hub.example --code K7QM-3XPA')).toBeInTheDocument()
  })
  it('shows two ways to give a machine its own address', async () => {
    render(<Hub />)
    expect(screen.getAllByText('muxtower expose tailscale').length).toBe(2)
    await userEvent.click(screen.getByRole('tab', { name: 'Cloudflare Tunnel' }))
    expect(screen.getByText('cloudflared tunnel create laptop')).toBeInTheDocument()
  })
})
