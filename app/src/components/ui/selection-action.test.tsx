import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SelectionAction } from './selection-action'

afterEach(() => vi.useRealTimers())

function Area({ onAction }: { onAction: (text: string) => void }) {
  const within = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={within}>
        <p>Pick a date for round two</p>
      </div>
      <p>Elsewhere</p>
      <SelectionAction within={within} label="Reply" icon={() => null} onAction={onAction} />
    </>
  )
}

function select(text: string) {
  const range = document.createRange()
  range.selectNodeContents(screen.getByText(text))
  document.getSelection()!.removeAllRanges()
  document.getSelection()!.addRange(range)
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
    vi.advanceTimersByTime(250)
  })
}

describe('SelectionAction', () => {
  it('offers its action under text selected inside its area, and acts on that text', () => {
    vi.useFakeTimers()
    const onAction = vi.fn()
    render(<Area onAction={onAction} />)
    select('Elsewhere')
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull() // not its area
    select('Pick a date for round two')
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    expect(onAction).toHaveBeenCalledWith('Pick a date for round two')
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
  })

  it('copies the selected text, says so, then goes', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const onAction = vi.fn()
    render(<Area onAction={onAction} />)
    select('Pick a date for round two')
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('Pick a date for round two')
    expect(onAction).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    act(() => void vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
    expect(document.getSelection()!.toString()).toBe('')
  })

  it('waits for a mouse dragging out a selection to let go', () => {
    vi.useFakeTimers()
    render(<Area onAction={() => {}} />)
    fireEvent.pointerDown(document)
    select('Pick a date for round two')
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
    fireEvent.pointerUp(document)
    act(() => void vi.advanceTimersByTime(250))
    expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy()
  })

  it('lets the selection go before it acts, so what acting focuses keeps its caret', () => {
    vi.useFakeTimers()
    let selectedWhileActing = -1
    render(<Area onAction={() => (selectedWhileActing = document.getSelection()!.rangeCount)} />)
    select('Pick a date for round two')
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    expect(selectedWhileActing).toBe(0)
  })
})
