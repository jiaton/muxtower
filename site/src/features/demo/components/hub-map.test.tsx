import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { frameAt } from '../model/player'
import { HubMap } from './hub-map'

describe('HubMap', () => {
  it('draws the hub, the machines dialing out and the phone on HTTPS', () => {
    render(<HubMap world={frameAt(37000).world} />)
    expect(screen.getByText('lists all 8 agents')).toBeInTheDocument()
    expect(screen.getAllByText(/dials out/)).toHaveLength(4)
    expect(screen.getByText(/HTTPS to the hub/)).toBeInTheDocument()
  })
})
