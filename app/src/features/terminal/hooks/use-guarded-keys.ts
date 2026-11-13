import { useRef, useState } from 'react'

/** How long the tap that confirms a guarded key may wait. */
export const CONFIRM_MS = 4000

/**
 * Keys that ask before they go (`guard(key)` says why, or null to send at once): the first tap shows the
 * reason and sends nothing; a second tap of the same key within CONFIRM_MS sends it. Any other key, or the
 * wait running out, forgets the first tap.
 */
export function useGuardedKeys(guard: (key: string) => string | null, send: (key: string) => void, now = () => Date.now()) {
  const armed = useRef<{ key: string; until: number } | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const press = (key: string) => {
    const reason = guard(key)
    const confirmed = armed.current?.key === key && now() < armed.current.until
    clearTimeout(timer.current)
    if (reason && !confirmed) {
      armed.current = { key, until: now() + CONFIRM_MS }
      setHint(reason)
      timer.current = setTimeout(() => {
        armed.current = null
        setHint(null)
      }, CONFIRM_MS)
      return
    }
    armed.current = null
    setHint(null)
    send(key)
  }
  return { press, hint }
}
