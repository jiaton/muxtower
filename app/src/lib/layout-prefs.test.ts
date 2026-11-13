import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useFocusShortcut, useLayoutPrefs } from './layout-prefs'

afterEach(() => useLayoutPrefs.setState({ sidebar: true, list: true }))

const press = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }))

describe('focus mode', () => {
  it('hides both panes, and brings both back when both are away', () => {
    useLayoutPrefs.getState().toggleFocus()
    expect(useLayoutPrefs.getState()).toMatchObject({ sidebar: false, list: false })
    useLayoutPrefs.getState().toggleFocus()
    expect(useLayoutPrefs.getState()).toMatchObject({ sidebar: true, list: true })
  })

  it('hides what is left when only one pane was hidden', () => {
    useLayoutPrefs.getState().setList(false)
    useLayoutPrefs.getState().toggleFocus()
    expect(useLayoutPrefs.getState()).toMatchObject({ sidebar: false, list: false })
  })

  it('toggles on Alt+F by the key, and not with Ctrl, Cmd or Shift, nor when off', () => {
    const { rerender } = renderHook(({ on }) => useFocusShortcut(on), { initialProps: { on: true } })
    press({ code: 'KeyF', key: 'ƒ', altKey: true, ctrlKey: true })
    press({ code: 'KeyF', altKey: true, metaKey: true })
    press({ code: 'KeyF', altKey: true, shiftKey: true })
    press({ code: 'KeyF', key: 'f' })
    expect(useLayoutPrefs.getState().list).toBe(true)
    press({ code: 'KeyF', key: 'ƒ', altKey: true })
    expect(useLayoutPrefs.getState()).toMatchObject({ sidebar: false, list: false })
    rerender({ on: false })
    press({ code: 'KeyF', altKey: true })
    expect(useLayoutPrefs.getState().list).toBe(false)
  })
})
