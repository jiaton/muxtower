import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { frameAt } from '../model/player'
import { DesktopWindow } from './desktop-window'

describe('DesktopWindow', () => {
  it('lists every machine and opens a session well into its work', () => {
    render(<DesktopWindow world={frameAt(0).world} />)
    for (const name of ['nas', 'server', 'vps', 'macbook', 'pc']) expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    expect(screen.getByText(/About 1 in 200 charges fail/)).toBeInTheDocument()
    expect(screen.getAllByText(/^Plan: retry a charge/).length).toBeGreaterThan(0)
  })

  it('shows what my_team and send_task return, then the task arriving at the worker', () => {
    const research = render(<DesktopWindow world={frameAt(19000).world} />)
    expect(screen.getByText(/^Your team \(1 other session in acme\/shop\)/)).toBeInTheDocument()
    expect(screen.getByText(/^Delivered to shop \(worker/)).toBeInTheDocument()
    research.unmount()
    render(<DesktopWindow world={frameAt(21500).world} />)
    expect(screen.getByText(/^\[muxtower task from shop-research \(research\) · 7c1e04a9b2d3\]/)).toBeInTheDocument()
  })
})
