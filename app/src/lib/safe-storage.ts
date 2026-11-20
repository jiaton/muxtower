import { createJSONStorage, type StateStorage } from 'zustand/middleware'

/**
 * This browser's localStorage for a persisted store, never throwing: a browser that refuses it (a private
 * window, storage blocked or full) reads nothing and keeps nothing, and the store goes on in memory.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value)
    } catch {
      // kept for this visit only
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name)
    } catch {
      // nothing kept to remove
    }
  },
}

/** `safeLocalStorage` as `persist` takes it (JSON). */
export const safeJSONStorage = <S>() => createJSONStorage<S>(() => safeLocalStorage)
