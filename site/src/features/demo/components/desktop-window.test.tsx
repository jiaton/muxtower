import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { frameAt } from '../model/player'
import { DesktopWindow } from './desktop-window'

describe('DesktopWindow', () => {
  it('lists every machine and its sessions, and opens one', () => {
    render(<DesktopWindow world={frameAt(0).world} />)
    for (const name of ['nas', 'server', 'vps', 'macbook', 'pc']) expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    expect(screen.getByText('hub')).toBeInTheDocument()
    expect(screen.getByText('How should the payment client retry?')).toBeInTheDocument()
  })

  it('shows a task handed to the worker', () => {
    render(<DesktopWindow world={frameAt(19000).world} />)
    expect(screen.getByText('delivered')).toBeInTheDocument()
    expect(screen.getByText('task from research')).toBeInTheDocument()
  })
})
