import { afterEach, expect, it, vi } from 'vitest'
import { newer, useAppUpdate, watchForUpdates } from './app-update'

afterEach(() => useAppUpdate.setState({ ready: false }))

it('tells versions apart by number, not as text', () => {
  expect(newer('0.1.50', '0.1.9')).toBe(true)
  expect(newer('0.1.9', '0.1.50')).toBe(false)
  expect(newer('0.2', '0.1.99')).toBe(true)
  expect(newer('0.1.50', '0.1.50')).toBe(false)
  expect(newer('demo', '0.1.50')).toBe(false) // not a version: no hint
  expect(newer('0.1.50', '')).toBe(false)
})

it('says a new version is there while the app is in front, and looks for one when it comes back', async () => {
  const update = vi.fn(async () => {})
  const workers = Object.assign(new EventTarget(), { controller: {}, getRegistration: async () => ({ update }) })
  Object.defineProperty(navigator, 'serviceWorker', { value: workers, configurable: true })
  const reload = vi.fn()
  vi.stubGlobal('location', { ...location, reload })
  watchForUpdates()
  workers.dispatchEvent(new Event('controllerchange'))
  expect(useAppUpdate.getState().ready).toBe(true)
  expect(reload).not.toHaveBeenCalled() // never under the owner's hands
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(() => expect(update).toHaveBeenCalled()) // visible again: asks for a newer worker
  vi.unstubAllGlobals()
})
