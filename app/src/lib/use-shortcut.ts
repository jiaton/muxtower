import { useEffect, useRef } from 'react'
import { matches, overlayOpen, type ShortcutId } from './shortcuts'

/**
 * A shortcut from the registry (`lib/shortcuts.ts`) anywhere on the page, while `enabled`: also while typing
 * in a field and with the terminal focused (it shows the agent's screen; keys never go from it to the
 * agent), never while a dialog, sheet or menu is open (the key is then theirs, and an Option character is
 * typed as usual). The key's own effect (Option's character on a Mac) is prevented.
 */
export function useShortcut(id: ShortcutId, run: () => void, enabled = true) {
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || !matches(id, e) || overlayOpen()) return
      e.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, enabled])
}
