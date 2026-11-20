import { afterEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeJSONStorage, safeLocalStorage } from './safe-storage'

describe('safeLocalStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('reads and writes this browser’s localStorage', () => {
    safeLocalStorage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
    expect(safeLocalStorage.getItem('k')).toBe('v')
    safeLocalStorage.removeItem('k')
    expect(safeLocalStorage.getItem('k')).toBeNull()
  })

  it('never throws when the browser refuses storage, and a store goes on in memory', () => {
    const refuse = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse)
    expect(safeLocalStorage.getItem('k')).toBeNull()
    expect(() => safeLocalStorage.setItem('k', 'v')).not.toThrow()
    expect(() => safeLocalStorage.removeItem('k')).not.toThrow()
    const store = create<{ n: number; up: () => void }>()(
      persist((set) => ({ n: 0, up: () => set((s) => ({ n: s.n + 1 })) }), { name: 'refused', storage: safeJSONStorage() }),
    )
    expect(() => store.getState().up()).not.toThrow()
    expect(store.getState().n).toBe(1)
  })
})
