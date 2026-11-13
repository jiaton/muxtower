import { motion } from 'motion/react'
import type { Box } from '../hooks/use-target-box'
import { device } from '@/components/ui/intents'

/** The pointer that walks the visitor through the demo: it glides to its target and presses it. */
export function Cursor({ box, pressed }: { box: Box | null; pressed: boolean }) {
  const point = box && { x: box.x + Math.min(box.width / 2, 48), y: box.y + box.height / 2 }
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-30"
      initial={false}
      animate={point ? { x: point.x, y: point.y, opacity: 1 } : { opacity: 0 }}
      transition={{ type: 'tween', ease: [0.33, 1, 0.68, 1], duration: 0.55 }}
    >
      <motion.span
        className={`${device.cursorGlow} absolute -top-5 -left-5 size-10`}
        animate={{ scale: pressed ? 1.6 : 0.6, opacity: pressed ? 1 : 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.svg
        width="22"
        height="26"
        viewBox="0 0 22 26"
        className={`${device.cursorShadow} relative`}
        animate={{ scale: pressed ? 0.85 : 1 }}
        transition={{ duration: 0.12 }}
      >
        <path
          d="M2 2 L2 21 L7.2 16.4 L10.6 24 L14 22.5 L10.7 15 L18 15 Z"
          className={device.cursorArrow}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </motion.svg>
    </motion.div>
  )
}
