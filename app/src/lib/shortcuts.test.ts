import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { capsOf, chordMatches, keysOf, matches, SHORTCUTS, withKeys } from './shortcuts'
import { useShortcut } from './use-shortcut'

type Keys = Partial<Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>>
const ev = (k: Keys) => ({ code: '', key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...k })

describe('matching a chord', () => {
  it("goes by the key's position, so a Mac's Option character still counts", () => {
    expect(matches('interrupt', ev({ code: 'KeyI', key: 'Dead', altKey: true }), true)).toBe(true) // Option+I: "ˆ", a dead key
    expect(matches('view', ev({ code: 'KeyV', key: '√', altKey: true }), true)).toBe(true)
    expect(matches('read', ev({ code: 'KeyR', key: '®', altKey: true }), true)).toBe(true)
    expect(matches('interrupt', ev({ code: 'KeyI', key: 'i', altKey: true }), false)).toBe(true)
  })

  it('takes its modifiers exactly: AltGr (Ctrl+Alt), Cmd or Shift with them is another key', () => {
    expect(matches('interrupt', ev({ code: 'KeyI', altKey: true, ctrlKey: true }), false)).toBe(false)
    expect(matches('interrupt', ev({ code: 'KeyI', altKey: true, metaKey: true }), true)).toBe(false)
    expect(matches('interrupt', ev({ code: 'KeyI', altKey: true, shiftKey: true }), false)).toBe(false)
    expect(matches('interrupt', ev({ code: 'KeyI', key: 'i' }), false)).toBe(false)
  })

  it('cmd is ⌘ on a Mac and Ctrl elsewhere; ctrl is Ctrl on both', () => {
    expect(matches('palette', ev({ code: 'KeyK', metaKey: true }), true)).toBe(true)
    expect(matches('palette', ev({ code: 'KeyK', ctrlKey: true }), true)).toBe(false)
    expect(matches('palette', ev({ code: 'KeyK', ctrlKey: true }), false)).toBe(true)
    expect(matches('clear', ev({ code: 'KeyU', ctrlKey: true }), true)).toBe(true)
    expect(matches('clear', ev({ code: 'KeyU', metaKey: true }), true)).toBe(false)
    expect(matches('clear', ev({ code: 'KeyU', ctrlKey: true }), false)).toBe(true)
  })

  it('a typed character by the character, without Ctrl, Cmd or Alt', () => {
    expect(chordMatches({ char: '?' }, ev({ code: 'Slash', key: '?', shiftKey: true }))).toBe(true)
    expect(chordMatches({ char: '?' }, ev({ code: 'Comma', key: '?', shiftKey: true }))).toBe(true) // another layout
    expect(chordMatches({ char: '?' }, ev({ key: '?', ctrlKey: true }))).toBe(false)
  })
})

describe('saying a chord', () => {
  it('in Mac glyphs on a Mac, Ctrl and Alt elsewhere', () => {
    expect(keysOf('interrupt', true)).toBe('⌥I')
    expect(keysOf('interrupt', false)).toBe('Alt+I')
    expect(keysOf('clear', true)).toBe('⌃U')
    expect(keysOf('clear', false)).toBe('Ctrl+U')
    expect(capsOf(SHORTCUTS.palette.keys[0], true)).toEqual(['⌘', 'K'])
    expect(capsOf(SHORTCUTS.newLine.keys[0], true)).toEqual(['⇧', '↵'])
    expect(withKeys('Interrupt', 'interrupt', false)).toBe('Interrupt (Alt+I)')
  })
})

describe('useShortcut', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })
  const press = (k: Keys, target: EventTarget = window) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...k })
    target.dispatchEvent(e)
    return e
  }

  it('acts anywhere, typing included, and keeps the Option character from being typed', () => {
    const run = vi.fn()
    renderHook(() => useShortcut('view', run))
    const field = document.body.appendChild(document.createElement('textarea'))
    field.focus()
    const e = press({ code: 'KeyV', key: '√', altKey: true }, field)
    expect(run).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
    press({ code: 'KeyV', key: 'v' }, field)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does nothing inside an open dialog, alert, sheet or menu, nor while off', () => {
    const run = vi.fn()
    const { rerender } = renderHook(({ on }) => useShortcut('read', run, on), { initialProps: { on: true } })
    for (const role of ['dialog', 'alertdialog', 'menu']) {
      const box = document.body.appendChild(document.createElement('div'))
      box.setAttribute('role', role)
      const e = press({ code: 'KeyR', key: '®', altKey: true })
      expect(e.defaultPrevented).toBe(false) // the character is the dialog's to type
      box.remove()
    }
    expect(run).not.toHaveBeenCalled()
    rerender({ on: false })
    press({ code: 'KeyR', altKey: true })
    expect(run).not.toHaveBeenCalled()
    rerender({ on: true })
    press({ code: 'KeyR', altKey: true })
    expect(run).toHaveBeenCalledTimes(1)
  })
})
