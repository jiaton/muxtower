import { useEffect, useRef } from 'react'

const FIRST_REPEAT_MS = 400
const REPEAT_MS = 110

/** Pointer handlers for a key that fires on press and, while held, repeats (arrows, backspace) like a
 *  keyboard. Pressing never takes focus, so the phone keyboard stays as it was. */
export function useKeyRepeat(fire: (key: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stop = () => clearTimeout(timer.current)
  useEffect(() => stop, [])

  return (key: string, repeat: boolean) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return // another mouse button (back, forward) is the browser's
      e.preventDefault()
      fire(key)
      if (!repeat) return
      const again = (delay: number) => {
        timer.current = setTimeout(() => {
          fire(key)
          again(REPEAT_MS)
        }, delay)
      }
      again(FIRST_REPEAT_MS)
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // Keyboard users: Enter / Space on the focused key.
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) fire(key)
    },
  })
}
