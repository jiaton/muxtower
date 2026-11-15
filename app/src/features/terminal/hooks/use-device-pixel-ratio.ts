import { useSyncExternalStore } from 'react'

/** The device pixel ratio, kept current (a window moved to another screen, the page zoomed). */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== 'function') return () => {}
      let query = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
      const changed = () => {
        query.removeEventListener('change', changed)
        query = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
        query.addEventListener('change', changed)
        onChange()
      }
      query.addEventListener('change', changed)
      return () => query.removeEventListener('change', changed)
    },
    () => (typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1),
    () => 1,
  )
}
