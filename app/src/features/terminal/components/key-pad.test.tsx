import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KeyPad } from './key-pad'

describe('KeyPad', () => {
  it('fires a key on press, and only the keys the session takes', () => {
    const onKey = vi.fn()
    render(<KeyPad keys={[]} onKey={onKey} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Up' }))
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Up' }))
    expect(onKey).toHaveBeenCalledWith('Up')
    expect(screen.getAllByRole('button')).toHaveLength(11)
  })

  it('repeats a held arrow until released', () => {
    vi.useFakeTimers()
    const onKey = vi.fn()
    render(<KeyPad keys={[]} onKey={onKey} />)
    const left = screen.getByRole('button', { name: 'Left' })
    fireEvent.pointerDown(left)
    vi.advanceTimersByTime(400 + 110 * 2)
    fireEvent.pointerUp(left)
    vi.advanceTimersByTime(1000)
    expect(onKey).toHaveBeenCalledTimes(4)
    vi.useRealTimers()
  })

  it('shows a lone interrupt key as one labelled button', () => {
    render(<KeyPad keys={['Escape']} onKey={() => {}} />)
    expect(screen.getByRole('button', { name: 'Escape' })).toHaveTextContent('esc · interrupt')
  })
})
