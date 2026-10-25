import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { useListMemory } from '../store'

/** Keeps a scroll container's position per `key` (e.g. the list's query): leaving and coming back,
 *  or hiding and showing the pane (phones), lands where the reader was. `ready`: content is there. */
export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string, active: boolean, ready: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    if (el && active && ready) el.scrollTop = useListMemory.getState().positions[key] ?? 0
  }, [ref, key, active, ready])

  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    const save = () => {
      useListMemory.setState((s) => ({ positions: { ...s.positions, [key]: el.scrollTop } }))
    }
    el.addEventListener('scroll', save, { passive: true })
    return () => el.removeEventListener('scroll', save)
  }, [ref, key, active])
}
