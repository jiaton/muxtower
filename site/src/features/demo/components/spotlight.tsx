import { AnimatePresence, motion } from 'motion/react'
import { RichText } from '@/components/shared/rich-text'
import type { Box } from '../hooks/use-target-box'

const PAD = 8

/** Where to look: a lit frame around the target, the rest of the stage dimmed, and a short note
 *  above it, or inside its top right corner when there is no room above (a target at the top of the
 *  stage), where it covers the least of what the target says. */
export function Spotlight({ box, note }: { box: Box | null; note?: string }) {
  const frame = box && { x: box.x - PAD, y: box.y - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }
  const inside = frame ? frame.y < 48 : false
  return (
    <AnimatePresence>
      {frame && (
        <motion.div
          key="spotlight"
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-20 rounded-lg shadow-spotlight ring-2 ring-primary"
          initial={{ opacity: 0, ...frame }}
          animate={{ opacity: 1, ...frame }}
          exit={{ opacity: 0 }}
          transition={{ type: 'tween', ease: [0.33, 1, 0.68, 1], duration: 0.5 }}
        >
          <AnimatePresence mode="wait">
            {note && (
              <motion.p
                key={note}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute rounded-md bg-primary px-2.5 py-1 text-sm font-medium whitespace-nowrap text-primary-foreground shadow-card"
                style={inside ? { top: 8, right: 8 } : { top: -38, left: 0 }}
              >
                <RichText text={note} />
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
