import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDrafts } from '../store'
import { InputBar } from './input-bar'

const mutate = vi.fn((_body: unknown, options?: { onSuccess?: () => void; onError?: () => void }) => options?.onSuccess?.())
vi.mock('../api/use-terminal', () => ({ useSendInput: () => ({ mutate, isPending: false, isError: false }) }))
// jsdom draws no pictures: one that fits is sent as it is anyway.
vi.mock('../images', async (actual) => ({
  ...(await actual<typeof import('../images')>()),
  shrink: async (file: Blob) => ({ blob: file, type: file.type }),
}))

/** A screen that is a phone's (a coarse pointer) or not. */
function device(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query.includes('coarse'),
    addEventListener() {},
    removeEventListener() {},
  }))
}

beforeEach(() => {
  mutate.mockClear()
  useDrafts.setState({ drafts: {}, quotes: {} })
})
afterEach(() => vi.unstubAllGlobals())

const box = () => screen.getByRole('textbox', { name: 'Message the agent' })

describe('InputBar', () => {
  it('keeps quotes above the box, apart from what is typed, and sends them first', () => {
    device(false)
    useDrafts.getState().addQuote('nas/s1', 'Pick a date')
    useDrafts.getState().addQuote('nas/s1', 'Or 11/4')
    render(<InputBar daemonId="nas" sessionId="s1" />)
    expect(screen.getByRole('list', { name: 'Quoted' }).textContent).toContain('Pick a date')
    expect(box()).toHaveValue('') // the box is for typing
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove quote' })[1]!)
    fireEvent.change(box(), { target: { value: '11/9 works' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(mutate.mock.calls[0]![0]).toEqual({ text: '> Pick a date\n\n11/9 works', enter: true })
    expect(useDrafts.getState()).toMatchObject({ drafts: {}, quotes: {} }) // sent: both go
  })

  it('opens a quote on a tap to reply to that part alone, and sends each reply under its quote', () => {
    device(false)
    useDrafts.getState().addQuote('nas/s1', 'Pick a date')
    useDrafts.getState().addQuote('nas/s1', 'Jill has not answered')
    render(<InputBar daemonId="nas" sessionId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: /Pick a date/ }))
    const reply = screen.getByRole('textbox', { name: 'Reply to this quote' })
    expect(document.activeElement).toBe(reply)
    fireEvent.change(reply, { target: { value: '11/9-11/11' } })
    fireEvent.click(screen.getByRole('button', { name: /Pick a date/ })) // closed: its reply shows under it
    expect(screen.queryByRole('textbox', { name: 'Reply to this quote' })).toBeNull()
    expect(screen.getByRole('button', { name: /Pick a date/ }).textContent).toContain('11/9-11/11')
    fireEvent.change(box(), { target: { value: 'the rest as you said' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(mutate.mock.calls[0]![0]).toEqual({
      text: '> Pick a date\n\n11/9-11/11\n\n> Jill has not answered\n\nthe rest as you said',
      enter: true,
    })
  })

  it('sends on Enter with a keyboard, but not on the Enter that picks an input method word', () => {
    device(false)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    fireEvent.change(box(), { target: { value: 'ceshi' } })
    fireEvent.keyDown(box(), { key: 'Enter', keyCode: 229 })
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('on a phone, return is a new line, Send sends, and quoting leaves the keyboard down', () => {
    device(true)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    fireEvent.change(box(), { target: { value: 'first part' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(mutate).not.toHaveBeenCalled()
    useDrafts.getState().addQuote('nas/s1', 'quote it')
    expect(document.activeElement).not.toBe(box())
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('with a conversation, empties the box at once and puts the message back if it cannot be sent', () => {
    device(false)
    const tracked = { sent: vi.fn(), failed: vi.fn() }
    const track = vi.fn(() => tracked)
    let fail: (() => void) | undefined
    mutate.mockImplementationOnce((_body, options) => {
      fail = options?.onError
    })
    useDrafts.getState().addQuote('nas/s1', 'Pick a date')
    render(<InputBar daemonId="nas" sessionId="s1" track={track} />)
    fireEvent.change(box(), { target: { value: 'Friday' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(track).toHaveBeenCalledWith('> Pick a date\n\nFriday')
    expect(useDrafts.getState()).toMatchObject({ drafts: {}, quotes: {} }) // shown in the conversation instead
    fireEvent.change(box(), { target: { value: 'and Saturday' } })
    act(() => fail!())
    expect(tracked.failed).toHaveBeenCalled()
    expect(box()).toHaveValue('Friday\nand Saturday')
    expect(useDrafts.getState().quotes['nas/s1']).toEqual([{ text: 'Pick a date', reply: '' }])
  })

  it('takes pasted pictures where the session does, shows them over the words and sends them along', async () => {
    device(false)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }))
    render(<InputBar daemonId="nas" sessionId="s1" images />)
    const shot = new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.paste(box(), { clipboardData: { files: [shot] } })
    })
    expect(screen.getByRole('list', { name: 'Pictures' }).querySelectorAll('img')).toHaveLength(1)
    fireEvent.change(box(), { target: { value: 'what broke?' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    await vi.waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(mutate.mock.calls[0]![0]).toEqual({
      text: 'what broke?', enter: true, images: [{ media_type: 'image/png', data: 'iVBORw==' }],
    }) // prettier-ignore
    expect(screen.queryByRole('list', { name: 'Pictures' })).toBeNull()
  })

  it('offers no pictures where the session takes none', () => {
    device(false)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    expect(screen.queryByRole('button', { name: 'Add pictures' })).toBeNull()
  })
})
