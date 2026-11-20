import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { layoutsFor, migrateLayout, shownLayout, useLayoutPrefs, useLayoutShortcut, type Layout } from './layout-prefs'

afterEach(() => useLayoutPrefs.setState({ layout: 'full', previous: 'full' }))

const press = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }))

describe('the saved layout', () => {
  it('version 1 (the sidebar and the list shown or not) becomes the layout each pair was', () => {
    const cases: [{ sidebar: boolean; list: boolean }, Layout][] = [
      [{ sidebar: true, list: true }, 'full'],
      [{ sidebar: false, list: true }, 'list'],
      [{ sidebar: false, list: false }, 'session'],
      [{ sidebar: true, list: false }, 'full'],
    ]
    for (const [old, layout] of cases) expect(migrateLayout(old, 1)).toEqual({ layout, previous: 'full' })
  })

  it('a version 1 value of the wrong shape counts as shown', () => {
    expect(migrateLayout({ sidebar: 'no', list: false }, 1)).toEqual({ layout: 'full', previous: 'full' })
    expect(migrateLayout({ sidebar: false }, 1)).toEqual({ layout: 'list', previous: 'full' })
  })

  it('loads from version 1 in localStorage, and drops a layout it does not know', async () => {
    localStorage.setItem('muxtower.layout', JSON.stringify({ state: { sidebar: false, list: false }, version: 1 }))
    await useLayoutPrefs.persist.rehydrate()
    expect(useLayoutPrefs.getState()).toMatchObject({ layout: 'session', previous: 'full' })
    localStorage.setItem('muxtower.layout', JSON.stringify({ state: { layout: 'wide', previous: 3 }, version: 2 }))
    await useLayoutPrefs.persist.rehydrate()
    expect(useLayoutPrefs.getState()).toMatchObject({ layout: 'full', previous: 'full' })
    localStorage.clear()
  })
})

describe('a narrow screen', () => {
  it('shows the widest layout it can, and never writes it back', () => {
    const fold = { dock: false, split: true }
    expect(shownLayout('full', fold)).toBe('list')
    expect(shownLayout('list', fold)).toBe('list')
    expect(shownLayout('session', fold)).toBe('session')
    expect(shownLayout('full', { dock: false, split: false })).toBeNull() // a phone: one pane at a time
    expect(useLayoutPrefs.getState().layout).toBe('full') // still what was picked: unfolded, it is back
    expect(shownLayout(useLayoutPrefs.getState().layout, { dock: true, split: true })).toBe('full')
  })

  it('offers the layouts it can show: three, two, none', () => {
    expect(layoutsFor({ dock: true, split: true })).toEqual(['full', 'list', 'session'])
    expect(layoutsFor({ dock: false, split: true })).toEqual(['list', 'session'])
    expect(layoutsFor({ dock: false, split: false })).toEqual([])
  })
})

describe('Alt+F', () => {
  it('goes to the session only and back to the layout before it', () => {
    for (const from of ['full', 'list'] as const) {
      useLayoutPrefs.setState({ layout: from })
      useLayoutPrefs.getState().toggleSessionOnly()
      expect(useLayoutPrefs.getState().layout).toBe('session')
      useLayoutPrefs.getState().toggleSessionOnly()
      expect(useLayoutPrefs.getState().layout).toBe(from)
    }
  })

  it('back from a session only picked in the switch, too', () => {
    useLayoutPrefs.setState({ layout: 'list' })
    useLayoutPrefs.getState().setLayout('session')
    useLayoutPrefs.getState().toggleSessionOnly()
    expect(useLayoutPrefs.getState().layout).toBe('list')
  })

  it('toggles on Alt+F by the key, and not with Ctrl, Cmd or Shift, nor when off', () => {
    const { rerender } = renderHook(({ on }) => useLayoutShortcut(on), { initialProps: { on: true } })
    press({ code: 'KeyF', key: 'ƒ', altKey: true, ctrlKey: true })
    press({ code: 'KeyF', altKey: true, metaKey: true })
    press({ code: 'KeyF', altKey: true, shiftKey: true })
    press({ code: 'KeyF', key: 'f' })
    expect(useLayoutPrefs.getState().layout).toBe('full')
    press({ code: 'KeyF', key: 'ƒ', altKey: true })
    expect(useLayoutPrefs.getState().layout).toBe('session')
    press({ code: 'KeyF', key: 'ƒ', altKey: true })
    expect(useLayoutPrefs.getState().layout).toBe('full')
    rerender({ on: false })
    press({ code: 'KeyF', altKey: true })
    expect(useLayoutPrefs.getState().layout).toBe('full')
  })
})

describe('the panes when the screen changes (a phone rotated, a Fold opened)', () => {
  it('keep their hooks in order while the media queries flip: no crash, and the widest layout shown', async () => {
    const { act: actNow, renderHook: render } = await import('@testing-library/react')
    const { usePanes } = await import('./layout-prefs')
    let width = 390
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return width >= Number(/(\d+)rem/.exec(query)![1]) * 16
      },
      media: query,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }))
    const { result } = render(() => usePanes(true))
    expect(result.current).toMatchObject({ shown: null, sidebarDocked: false, listInDrawer: true })
    const at = (w: number) =>
      actNow(() => {
        width = w
        for (const l of listeners) l()
      })
    at(900)
    expect(result.current).toMatchObject({ shown: 'list', sidebarDocked: false, listInDrawer: false, sidebarAlone: true })
    at(1440)
    expect(result.current).toMatchObject({ shown: 'full', sidebarDocked: true, listInDrawer: false, sidebarAlone: false })
    actNow(() => useLayoutPrefs.getState().setLayout('session'))
    expect(result.current).toMatchObject({ shown: 'session', sidebarDocked: false, listInDrawer: true, sidebarAlone: false })
    at(390)
    expect(useLayoutPrefs.getState().layout).toBe('session')
    vi.unstubAllGlobals()
  })
})
