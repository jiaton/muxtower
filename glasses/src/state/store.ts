import { createStore } from 'zustand/vanilla'
import { initialNav, type AppState } from './model'

export const createAppStore = () =>
  createStore<AppState>(() => ({
    link: 'unpaired',
    hubName: '',
    sessions: [],
    loaded: false,
    nav: initialNav(),
    notice: null,
  }))

export type AppStore = ReturnType<typeof createAppStore>
