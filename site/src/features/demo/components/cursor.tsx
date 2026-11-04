import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

interface Props {
  stage: React.RefObject<HTMLElement | null>
  /** The `data-demo` id it points at; none hides it. */
  target: string | null
  scale: number
  /** Re-measure when anything on the stage may have moved. */
  revision: unknown
  pressed: boolean
}

interface Point {
  x: number
  y: number
}

/** The pointer that walks the visitor through the demo: it glides to its target and presses it. */
export function Cursor({ stage, target, scale, revision, pressed }: Props) {
  const [point, setPoint] = useState<Point | null>(null)
  useEffect(() => {
    const root = stage.current
    const element = target ? root?.querySelector<HTMLElement>(`[data-demo="${target}"]`) : null
    if (!root || !element || !scale) return setPoint(null)
    const base = root.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    setPoint({
      x: (box.left - base.left + Math.min(box.width / 2, 48)) / scale,
      y: (box.top - base.top + box.height / 2) / scale,
    })
  }, [stage, target, scale, revision])

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-30"
      initial={false}
      animate={point ? { x: point.x, y: point.y, opacity: 1 } : { opacity: 0 }}
      transition={{ type: 'spring', stiffness: 90, damping: 18, mass: 0.9 }}
    >
      <motion.span
        className="absolute -top-5 -left-5 size-10 rounded-full bg-glow"
        animate={{ scale: pressed ? 1.6 : 0.6, opacity: pressed ? 1 : 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.svg
        width="22"
        height="26"
        viewBox="0 0 22 26"
        className="relative drop-shadow-lg"
        animate={{ scale: pressed ? 0.85 : 1 }}
        transition={{ duration: 0.12 }}
      >
        <path
          d="M2 2 L2 21 L7.2 16.4 L10.6 24 L14 22.5 L10.7 15 L18 15 Z"
          className="fill-cursor stroke-cursor-edge"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </motion.svg>
    </motion.div>
  )
}
