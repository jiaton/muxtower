import { useEffect, useState } from 'react'

/** A box on the stage, in the stage's own (unscaled) units. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Where the element marked `data-demo="<target>"` sits on the stage, measured again whenever
 *  `revision` changes (something on the stage moved). Null when there is no such element. */
export function useTargetBox(
  stage: React.RefObject<HTMLElement | null>,
  target: string | null,
  scale: number,
  revision: unknown,
): Box | null {
  const [box, setBox] = useState<Box | null>(null)
  useEffect(() => {
    const root = stage.current
    const element = target ? root?.querySelector<HTMLElement>(`[data-demo="${target}"]`) : null
    if (!root || !element || !scale) return setBox(null)
    const base = root.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    const next = {
      x: (rect.left - base.left) / scale,
      y: (rect.top - base.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    }
    // Only a box that moved: a new object every time would render the stage again for nothing.
    setBox((last) => (last && (Object.keys(next) as (keyof Box)[]).every((k) => last[k] === next[k]) ? last : next))
  }, [stage, target, scale, revision])
  return box
}
