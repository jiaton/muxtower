import { useEffect, useRef, type RefObject } from 'react'
import { useSidewaysWheel } from '@/components/ui/use-sideways-wheel'
import { useChipSwitchPrefs } from '../store'

/** Whether a key goes to what has the focus instead: a text field, or a box that takes keys itself
 *  (`data-own-keys`: the terminal). */
function typedInto(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return true
  return Boolean(target.closest('[data-own-keys]'))
}

/** `[` a step back, `]` a step on; 0 for any other key, a key with Ctrl, Cmd or Alt, one typed into a field
 *  or the terminal, and while a dialog or menu is open. */
export function chipKeyStep(e: KeyboardEvent): -1 | 0 | 1 {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return 0
  if (e.key !== '[' && e.key !== ']') return 0
  if (typedInto(e.target) || typedInto(document.activeElement)) return 0
  // An open dialog or menu (Radix's say `data-state`; a drawer is a dialog too, and the list may be in it).
  if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"], [role="menu"]')) return 0
  return e.key === '[' ? -1 : 1
}

/**
 * How the chip is switched without a click: a sideways wheel over `listRef` (unless turned off for this
 * browser, `useChipSwitchPrefs.wheel`), and `[` / `]` anywhere outside a text field and the terminal.
 */
export function useChipStepping(listRef: RefObject<HTMLElement | null>, onStep: (by: -1 | 1) => void) {
  const wheel = useChipSwitchPrefs((s) => s.wheel)
  useSidewaysWheel(listRef, onStep, wheel)
  const step = useRef(onStep)
  useEffect(() => {
    step.current = onStep
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const by = chipKeyStep(e)
      if (!by) return
      e.preventDefault()
      step.current(by)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
