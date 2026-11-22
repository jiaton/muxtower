import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetHistory, HISTORY_KEPT, useComposerHistory } from '@/lib/composer-history'
import { useDrafts } from '../store'
import { InputBar } from '../components/input-bar'

const mutate = vi.fn((_body: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.())
const acceptSuggestion = vi.fn()
vi.mock('../api/use-terminal', () => ({
  useSendInput: () => ({ mutate, isPending: false, isError: false }),
  useAcceptSuggestion: () => ({ mutate: acceptSuggestion, isPending: false, isError: false, reset: () => {} }),
}))

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  mutate.mockClear()
  useDrafts.setState({ drafts: {}, quotes: {}, filled: {} })
  useComposerHistory.setState({ sent: {} })
})
afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error put back as jsdom has it (none)
  delete document.execCommand
})

const box = () => screen.getByRole('textbox', { name: 'Message the agent' }) as HTMLTextAreaElement
const type = (text: string) => fireEvent.change(box(), { target: { value: text } })
const key = (code: string, more: Partial<KeyboardEventInit> = {}) => {
  const names: Record<string, string> = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', Escape: 'Escape', Enter: 'Enter' }
  return fireEvent.keyDown(box(), { code, key: names[code] ?? code.replace('Key', '').toLowerCase(), ...more })
}
const send = (text: string) => {
  type(text)
  key('Enter')
}

describe('Ctrl+U', () => {
  it('clears the box, and ⌘Z / Ctrl+Z brings it back (kept here where the browser cannot)', () => {
    render(<InputBar daemonId="d" sessionId="s1" />)
    type('a long message, half written')
    key('KeyU', { ctrlKey: true })
    expect(box()).toHaveValue('')
    key('KeyZ', { ctrlKey: true, metaKey: true }) // neither ⌘ nor Ctrl alone: not undo
    expect(box()).toHaveValue('')
    // Ctrl+Z off a Mac (jsdom's platform), and the caret at the end.
    key('KeyZ', { ctrlKey: true })
    expect(box()).toHaveValue('a long message, half written')
    expect(box().selectionStart).toBe('a long message, half written'.length)
    expect(mutate).not.toHaveBeenCalled()
  })

  it("is the browser's own delete over the whole text where it can (its undo has it then)", () => {
    const exec = vi.fn(() => {
      const el = box()
      // What a browser does: the selection deleted, an input event (React's onChange).
      fireEvent.change(el, { target: { value: el.value.slice(0, el.selectionStart) + el.value.slice(el.selectionEnd) } })
      return true
    })
    document.execCommand = exec
    render(<InputBar daemonId="d" sessionId="s1" />)
    type('draft')
    key('KeyU', { ctrlKey: true })
    expect(exec).toHaveBeenCalledWith('delete')
    expect(box()).toHaveValue('')
    // The browser's undo, not ours: nothing kept here.
    const undo = key('KeyZ', { ctrlKey: true })
    expect(undo).toBe(true) // not prevented: left to the browser
    expect(box()).toHaveValue('')
  })
})

describe('the messages sent, on ↑ and ↓', () => {
  it('↑ in an empty box recalls the last one sent here, ↑↓ walk them, ↓ past the newest empties it', () => {
    render(<InputBar daemonId="d" sessionId="s1" />)
    send('first')
    send('second')
    send('third')
    expect(box()).toHaveValue('')
    key('ArrowUp')
    expect(box()).toHaveValue('third')
    expect(box().selectionStart).toBe(5)
    key('ArrowUp')
    key('ArrowUp')
    expect(box()).toHaveValue('first')
    key('ArrowUp') // the oldest: stays
    expect(box()).toHaveValue('first')
    key('ArrowDown')
    expect(box()).toHaveValue('second')
    key('ArrowDown')
    key('ArrowDown')
    expect(box()).toHaveValue('')
  })

  it('keeps each session its own', () => {
    const { unmount } = render(<InputBar daemonId="d" sessionId="s1" />)
    send('to one')
    unmount()
    render(<InputBar daemonId="d" sessionId="s2" />)
    key('ArrowUp')
    expect(box()).toHaveValue('')
    send('to two')
    key('ArrowUp')
    expect(box()).toHaveValue('to two')
    expect(useComposerHistory.getState().sent).toEqual({ 'd/s1': ['to one'], 'd/s2': ['to two'] })
  })

  it('Esc leaves them, the box empty again; so does emptying it', () => {
    render(<InputBar daemonId="d" sessionId="s1" />)
    send('one')
    send('two')
    key('ArrowUp')
    key('ArrowUp')
    expect(key('Escape')).toBe(false) // taken
    expect(box()).toHaveValue('')
    key('ArrowUp')
    expect(box()).toHaveValue('two') // from the newest again
    type('')
    key('ArrowUp')
    expect(box()).toHaveValue('two')
  })

  it('↑ in a box with text in it is the caret’s, and so is ↑ in an edited one', () => {
    render(<InputBar daemonId="d" sessionId="s1" />)
    send('one')
    type('typing')
    expect(key('ArrowUp')).toBe(true) // not prevented
    expect(box()).toHaveValue('typing')
    type('')
    key('ArrowUp')
    type('one, changed')
    expect(key('ArrowUp')).toBe(true)
    expect(box()).toHaveValue('one, changed')
    expect(key('Escape')).toBe(true) // not ours either
  })

  it('a recalled one edited and sent is a new one; the old one stays', () => {
    render(<InputBar daemonId="d" sessionId="s1" />)
    send('run the tests')
    key('ArrowUp')
    type('run the tests again')
    key('Enter')
    expect(useComposerHistory.getState().sent['d/s1']).toEqual(['run the tests', 'run the tests again'])
    expect(mutate.mock.calls.map((c) => (c[0] as { text: string }).text)).toEqual(['run the tests', 'run the tests again'])
  })

  it('keeps the last 20, and the same one twice in a row once', () => {
    render(<InputBar daemonId="d" sessionId="s1" />)
    for (let i = 1; i <= 25; i++) send(`message ${i}`)
    send('message 25')
    const kept = useComposerHistory.getState().sent['d/s1']!
    expect(kept).toHaveLength(HISTORY_KEPT)
    expect(kept[0]).toBe('message 6')
    expect(kept.at(-1)).toBe('message 25')
  })

  it("keeps sends from the box only: not the agent's suggestion taken from an empty one", () => {
    render(<InputBar daemonId="d" sessionId="s1" suggestion="Commit the fix" />)
    key('Enter', { ctrlKey: true })
    expect(acceptSuggestion).toHaveBeenCalledWith('Commit the fix')
    expect(useComposerHistory.getState().sent).toEqual({})
  })

  it('goes when its session is deleted', () => {
    render(<InputBar daemonId="d" sessionId="s1" />)
    send('one')
    act(() => forgetHistory('d', 's1'))
    expect(useComposerHistory.getState().sent).toEqual({})
    key('ArrowUp')
    expect(box()).toHaveValue('')
  })
})
