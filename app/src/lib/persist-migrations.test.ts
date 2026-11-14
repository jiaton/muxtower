import { beforeEach, describe, expect, it } from 'vitest'
import { useListPrefs, useNewSessionPrefs, useSessionViews } from '@/features/sessions/store'
import { useDrafts, useTerminalPrefs } from '@/features/terminal/store'
import { useLayoutPrefs } from './layout-prefs'

/** What an older (or broken) version left in localStorage, read back the way an app start reads it. */
async function kept(name: string, state: unknown, version = 1) {
  localStorage.setItem(name, JSON.stringify({ state, version }))
}

beforeEach(() => localStorage.clear())

describe('persisted stores from older versions load', () => {
  it('terminal prefs: a field dropped since (keypad), one of another shape (fit), one missing', async () => {
    await kept('muxtower.terminal', { keypad: true, fit: ['a'], fontSize: 14 })
    await useTerminalPrefs.persist.rehydrate()
    const s = useTerminalPrefs.getState()
    expect(s.fontSize).toBe(14)
    expect(s.fit).toEqual({})
    expect(s.screens).toBe(2)
    expect('keypad' in s).toBe(false)
  })
  it('list prefs without collapsed and folded, or with them as something else', async () => {
    await kept('muxtower.list', { group: 'device' })
    await useListPrefs.persist.rehydrate()
    expect(useListPrefs.getState()).toMatchObject({ group: 'device', collapsed: [], folded: [] })
    await kept('muxtower.list', { group: 'device', collapsed: 'x', folded: null })
    await useListPrefs.persist.rehydrate()
    expect(useListPrefs.getState()).toMatchObject({ collapsed: [], folded: [] })
  })
  it('drafts from version 1 (quotes as text alone), and layout, views and new-session prefs of the wrong shape', async () => {
    await kept('muxtower.drafts', { drafts: { 'd/s': 'hi' }, quotes: { 'd/s': ['a line'] } })
    await useDrafts.persist.rehydrate()
    expect(useDrafts.getState().drafts['d/s']).toBe('hi')
    expect(useDrafts.getState().quotes['d/s']).toEqual([{ text: 'a line', reply: '' }])
    await kept('muxtower.layout', { sidebar: 'no', list: false })
    await useLayoutPrefs.persist.rehydrate()
    expect(useLayoutPrefs.getState()).toMatchObject({ sidebar: true, list: false })
    await kept('muxtower.views', { views: [], last: 3 })
    await useSessionViews.persist.rehydrate()
    expect(useSessionViews.getState().views).toEqual({})
    await kept('muxtower.new-session', { runtime: null })
    await useNewSessionPrefs.persist.rehydrate()
    expect(typeof useNewSessionPrefs.getState().runtime).toBe('string')
  })
  it('something that is no JSON object at all: the defaults', async () => {
    localStorage.setItem('muxtower.list', '"broken"')
    await useListPrefs.persist.rehydrate()
    expect(Array.isArray(useListPrefs.getState().collapsed)).toBe(true)
  })
})
