/** What survives a relaunch, in the Even App's storage for this app: the device token, the cursors and
 *  the last session opened, and the owner's gesture map. */
import { DEFAULT_GESTURES, type GestureMap } from '@/input/gestures'
import type { GlassesPort } from '@/platform/port'
import type { Nav } from './model'

const KEYS = { token: 'muxtower.token', nav: 'muxtower.nav', gestures: 'muxtower.gestures' } as const

export interface Saved {
  token: string | null
  cursors: Record<string, string>
  lastOpened: string | null
  gestures: GestureMap
}

function parse<T>(raw: string | null): Partial<T> {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    return value && typeof value === 'object' ? (value as Partial<T>) : {}
  } catch {
    return {}
  }
}

export async function loadSaved(port: GlassesPort): Promise<Saved> {
  const [token, nav, gestures] = await Promise.all([
    port.getItem(KEYS.token),
    port.getItem(KEYS.nav),
    port.getItem(KEYS.gestures),
  ])
  const savedNav = parse<Pick<Nav, 'cursors' | 'lastOpened'>>(nav)
  return {
    token: token || null,
    cursors: savedNav.cursors ?? {},
    lastOpened: savedNav.lastOpened ?? null,
    gestures: { ...DEFAULT_GESTURES, ...parse<GestureMap>(gestures) },
  }
}

export const saveToken = (port: GlassesPort, token: string | null) => port.setItem(KEYS.token, token ?? '')

export const saveNav = (port: GlassesPort, nav: Nav) =>
  port.setItem(KEYS.nav, JSON.stringify({ cursors: nav.cursors, lastOpened: nav.lastOpened }))
