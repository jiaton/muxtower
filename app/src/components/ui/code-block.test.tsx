import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SquareTerminal } from 'lucide-react'
import { CodeActionContext } from './code-block'
import { Markdown } from './markdown'

const REPLY = 'Run this:\n\n```sh\nnpm run build\nnpm test\n```\n\nand `inline` code.'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('code blocks', () => {
  it('offer the action of the place they are shown in, beside Copy', () => {
    const onAction = vi.fn()
    render(
      <CodeActionContext.Provider value={{ label: 'Put in the message box', icon: SquareTerminal, onAction }}>
        <Markdown>{REPLY}</Markdown>
      </CodeActionContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Put in the message box' }))
    expect(onAction).toHaveBeenCalledWith('npm run build\nnpm test')
  })

  it('copy their text, and only blocks get a button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<Markdown>{REPLY}</Markdown>)
    expect(screen.getAllByRole('button')).toHaveLength(1) // not the inline code
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy code' })))
    expect(writeText).toHaveBeenCalledWith('npm run build\nnpm test')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('say "Copied" for a moment', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    render(<Markdown>{REPLY}</Markdown>)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy code' })))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1600))
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })

  it('copy with the older command where there is no Clipboard API', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    let copied = ''
    const execCommand = vi.fn(() => {
      copied = document.querySelector('textarea')?.value ?? ''
      return true
    })
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    render(<Markdown>{REPLY}</Markdown>)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy code' })))
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(copied).toBe('npm run build\nnpm test')
    expect(document.querySelector('textarea')).toBeNull() // cleaned up
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
