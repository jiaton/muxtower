import { useCallback, useEffect, useRef, useState } from 'react'
import { DURATION } from '../model/script'

export interface Player {
  t: number
  playing: boolean
  play: () => void
  pause: () => void
  seek: (t: number) => void
}

/** The demo's clock. It runs only while the stage is on screen and the visitor has not asked for less
 *  motion (then it waits for Play), and loops at the end. */
export function usePlayer(stage: React.RefObject<HTMLElement | null>, duration = DURATION): Player {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [visible, setVisible] = useState(false)
  const chosen = useRef<boolean | null>(null)
  const clock = useRef({ t: 0, last: 0 })

  useEffect(() => {
    const element = stage.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [stage])

  useEffect(() => {
    if (chosen.current !== null) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (visible && !reduced) setPlaying(true)
  }, [visible])

  useEffect(() => {
    if (!playing || !visible) return
    let frame = 0
    clock.current.last = performance.now()
    const tick = (now: number) => {
      const next = clock.current.t + (now - clock.current.last)
      clock.current = { t: next >= duration ? 0 : next, last: now }
      setT(clock.current.t)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, visible, duration])

  const play = useCallback(() => {
    chosen.current = true
    setPlaying(true)
  }, [])
  const pause = useCallback(() => {
    chosen.current = false
    setPlaying(false)
  }, [])
  const seek = useCallback((to: number) => {
    clock.current.t = to
    setT(to)
  }, [])
  return { t, playing, play, pause, seek }
}
