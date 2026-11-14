import { useEffect, useState } from 'react'

/**
 * The app coming back: the page shown again (also restored from the back-forward cache), focused, or the
 * network back. A phone freezes a page in the background, closes its sockets and holds its timers; what
 * failed meanwhile says nothing about the daemons now. So on coming back the app reconnects and asks again
 * at once (`onResume`), and for SETTLE_MS after it (and while hidden) nothing is called unreachable or
 * switched over to a node on the strength of a failure (`settling`): only one seen after that counts.
 */
export const SETTLE_MS = 5_000
const DEDUPE_MS = 1_000 // the several events one return sends (visibility, focus, pageshow): once

const listeners = new Set<() => void>()
let installed = false
let resumedAt = 0
let lastFired = 0

const hidden = () => globalThis.document?.visibilityState === 'hidden'

function fire() {
  if (hidden()) return
  const now = Date.now()
  if (now - lastFired < DEDUPE_MS) return
  lastFired = resumedAt = now
  for (const listener of listeners) listener()
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  document.addEventListener('visibilitychange', fire)
  addEventListener('pageshow', fire)
  addEventListener('online', fire)
  addEventListener('focus', fire)
}

/** Calls `listener` each time the app comes back; returns how to stop. */
export function onResume(listener: () => void): () => void {
  install()
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Whether a failure now may come from the time away: hidden, or just back. */
export function settling(now = Date.now()): boolean {
  return hidden() || now - resumedAt < SETTLE_MS
}

/** `settling`, kept current for a component: true while hidden and for SETTLE_MS after coming back. */
export function useSettling(): boolean {
  const [value, setValue] = useState(() => settling())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(timer)
      setValue(settling())
      if (!hidden()) timer = setTimeout(() => setValue(settling()), SETTLE_MS - (Date.now() - resumedAt) + 10)
    }
    const stop = onResume(update)
    document.addEventListener('visibilitychange', update)
    return () => {
      stop()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return value
}

/** For tests: forget what happened. */
export function resetResume() {
  resumedAt = lastFired = 0
}
