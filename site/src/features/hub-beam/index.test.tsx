import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HubBeam } from '.'

describe('HubBeam', () => {
  it('draws every machine joined to the hub, and the devices that reach it', () => {
    render(<HubBeam />)
    expect(screen.getByRole('img', { name: /dial out to the hub/ })).toBeInTheDocument()
    for (const name of ['macbook', 'pc', 'server', 'vps', 'nas', 'phone', 'browser']) expect(screen.getByText(name)).toBeInTheDocument()
  })
})
