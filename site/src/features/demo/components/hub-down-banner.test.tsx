import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HubDownBanner } from './hub-down-banner'

describe('HubDownBanner', () => {
  it('says which machines are reached directly, as the app does', () => {
    render(<HubDownBanner target="b" />)
    expect(
      screen.getByText('nas unreachable · direct to server, vps, macbook, pc. It switches back when nas answers again.'),
    ).toBeInTheDocument()
  })
})
