import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDrafts } from '../store'
import type { TokenSource } from '@/components/ui/token-menu'
import { InputBar } from './input-bar'

const mutate = vi.fn((_body: unknown, options?: { onSuccess?: () => void; onError?: () => void }) => options?.onSuccess?.())
vi.mock('../api/use-terminal', () => ({ useSendInput: () => ({ mutate, isPending: false, isError: false }) }))
// jsdom draws no pictures: one that fits is sent as it is anyway. `hold` keeps the next one in the works.
let hold: Promise<void> | null = null
vi.mock('../images', async (actual) => ({
  ...(await actual<typeof import('../images')>()),
  shrink: async (file: Blob) => {
    await hold
    return { blob: file, type: file.type }
  },
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
  useDrafts.setState({ drafts: {}, quotes: {}, filled: {} })
})
afterEach(() => vi.unstubAllGlobals())

const box = () => screen.getByRole('textbox', { name: 'Message the agent' })
const reply = () => screen.getByRole('textbox', { name: 'Reply to this quote' })

describe('InputBar', () => {
  it('takes focus with the cursor at the end when a message is filled in from outside', () => {
    device(true)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    expect(box()).not.toHaveFocus()
    act(() => useDrafts.getState().fill('nas/s1', '!ls -la\npwd'))
    expect(box()).toHaveFocus()
    expect(box()).toHaveValue('!ls -la\npwd')
    expect((box() as HTMLTextAreaElement).selectionStart).toBe('!ls -la\npwd'.length)
  })

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

  it('Reply opens the new quote and focuses its own reply; Enter there goes on to the box; Enter there sends', () => {
    device(false)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    screen.getByRole('button', { name: 'Send' }).focus() // as after the click on Reply
    act(() => useDrafts.getState().addQuote('nas/s1', 'Pick a date'))
    expect(reply()).toHaveFocus()
    fireEvent.change(reply(), { target: { value: '11/9' } })
    fireEvent.keyDown(reply(), { key: 'Enter', keyCode: 229, isComposing: true }) // an input method's: nothing
    fireEvent.keyDown(reply(), { key: 'Enter', shiftKey: true }) // a new line: nothing here either
    expect(reply()).toHaveFocus()
    fireEvent.keyDown(reply(), { key: 'Enter' })
    expect(box()).toHaveFocus() // on to the message box, nothing sent
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.keyDown(box(), { key: 'Enter' }) // the box empty: sends the quote and its reply, no second Enter
    expect(mutate.mock.calls[0]![0]).toEqual({ text: '> Pick a date\n\n11/9', enter: true })
  })

  it('quoting again opens and focuses the newest quote, even one already there', () => {
    device(false)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    act(() => useDrafts.getState().addQuote('nas/s1', 'one'))
    act(() => useDrafts.getState().addQuote('nas/s1', 'two'))
    expect(reply()).toHaveFocus() // one reply field open: the newest's
    expect(screen.getAllByRole('textbox', { name: 'Reply to this quote' })).toHaveLength(1)
    expect(screen.getByRole('button', { expanded: true }).textContent).toContain('two')
    box().focus()
    act(() => useDrafts.getState().addQuote('nas/s1', 'one')) // already quoted: once, and opened again
    expect(useDrafts.getState().quotes['nas/s1']).toHaveLength(2)
    expect(screen.getByRole('button', { expanded: true }).textContent).toContain('one')
    expect(reply()).toHaveFocus()
  })

  it('never sends a quote alone on a first Enter: it goes on to the line to write; a second one sends', () => {
    device(false)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    act(() => useDrafts.getState().addQuote('nas/s1', 'Pick a date'))
    fireEvent.keyDown(box(), { key: 'Enter', keyCode: 229, isComposing: true }) // an input method's Enter
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(mutate).not.toHaveBeenCalled()
    expect(box()).toHaveFocus()
    expect(box()).toHaveAttribute('placeholder', 'Add a message, or Enter again to send')
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true }) // a new line, as ever: nothing sent
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(mutate.mock.calls[0]![0]).toEqual({ text: '> Pick a date', enter: true })
  })

  it('sends a quote with something written on the first Enter', () => {
    device(false)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    act(() => useDrafts.getState().addQuote('nas/s1', 'Pick a date'))
    fireEvent.change(box(), { target: { value: '11/9' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(mutate.mock.calls[0]![0]).toEqual({ text: '> Pick a date\n\n11/9', enter: true })
  })

  it('starts over when more is quoted after a first Enter', () => {
    device(false)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    act(() => useDrafts.getState().addQuote('nas/s1', 'one'))
    fireEvent.keyDown(box(), { key: 'Enter' })
    act(() => useDrafts.getState().addQuote('nas/s1', 'two'))
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(mutate).not.toHaveBeenCalled()
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

  it('on a phone, return is a new line, Send sends, and quoting focuses the quote', () => {
    device(true)
    render(<InputBar daemonId="nas" sessionId="s1" />)
    fireEvent.change(box(), { target: { value: 'first part' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(mutate).not.toHaveBeenCalled()
    act(() => useDrafts.getState().addQuote('nas/s1', 'quote it'))
    expect(reply()).toHaveFocus() // ready to reply to it (its keyboard may stay down)
    fireEvent.keyDown(reply(), { key: 'Enter' })
    expect(reply()).toHaveFocus() // return in it: a new line, as in the box
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(mutate).not.toHaveBeenCalled() // return on a phone never sends
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
    await vi.waitFor(() => expect(screen.getByRole('list', { name: 'Pictures' }).querySelectorAll('img')).toHaveLength(1))
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

  it('shows a placeholder at once while a pasted picture is made small, and Send waits for it', async () => {
    device(false)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }))
    let done = () => {}
    hold = new Promise<void>((resolve) => (done = resolve))
    render(<InputBar daemonId="nas" sessionId="s1" images />)
    fireEvent.change(box(), { target: { value: 'look' } })
    const photo = new File([new Uint8Array([255, 216, 255])], 'big.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.paste(box(), { clipboardData: { files: [photo] } })
    })
    expect(screen.getByRole('listitem', { name: 'Adding a picture' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await act(async () => {
      done()
      hold = null
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.queryByRole('listitem', { name: 'Adding a picture' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Pictures' }).querySelectorAll('img')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  describe('mentions', () => {
    const mention: TokenSource = {
      label: 'Mention a session',
      at: (value, caret) => {
        const i = value.slice(0, caret).lastIndexOf('@')
        return i < 0 || /\s/.test(value.slice(i + 1, caret)) ? null : { start: i, query: value.slice(i + 1, caret) }
      },
      rows: () => [{ key: 'pm', label: 'PM', text: '@PM@p (pm1)' }],
    }
    const typeIn = (el: HTMLElement, value: string) => {
      fireEvent.change(el, { target: { value } })
      ;(el as HTMLTextAreaElement).setSelectionRange(value.length, value.length)
      fireEvent.select(el)
    }

    it('in the box, @ offers sessions and Enter inserts one, without sending', () => {
      device(false)
      render(<InputBar daemonId="nas" sessionId="s1" mention={mention} />)
      box().focus()
      typeIn(box(), 'ask @')
      expect(screen.getByRole('listbox', { name: 'Mention a session' })).toBeInTheDocument()
      fireEvent.keyDown(box(), { key: 'Enter' })
      expect(box()).toHaveValue('ask @PM@p (pm1) ')
      expect(mutate).not.toHaveBeenCalled()
      fireEvent.keyDown(box(), { key: 'Enter' }) // the menu closed: Enter sends
      expect(mutate.mock.calls[0]![0]).toEqual({ text: 'ask @PM@p (pm1)', enter: true }) // trimmed: checked live, Claude Code takes it as text
    })

    it("in a quote's reply too: Enter inserts there, and does not go on to the box", () => {
      device(false)
      render(<InputBar daemonId="nas" sessionId="s1" mention={mention} />)
      act(() => useDrafts.getState().addQuote('nas/s1', 'Pick a date'))
      typeIn(reply(), 'cc @')
      fireEvent.keyDown(reply(), { key: 'Enter' })
      expect(reply()).toHaveValue('cc @PM@p (pm1) ')
      expect(reply()).toHaveFocus()
    })
  })
})
