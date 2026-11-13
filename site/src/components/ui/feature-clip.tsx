import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/** One of the site's feature clips (`clips/`, `npm run clips` there), framed: muted, looping, loaded only
 *  near the screen and played only while on it. With reduced motion, or before it loads, its poster stands
 *  still. */
export function FeatureClip({ id, label, className }: { id: string; label: string; className?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const src = `/clips/${id}`
  useEffect(() => {
    const el = video.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    let loaded = false
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting && !loaded && !still.matches) {
          loaded = true
          // Set once it is near, so nothing loads for a reader who never gets here. MP4 only: VP9 came out larger.
          el.src = `${src}.mp4`
        }
        if (entry.intersectionRatio >= 0.5 && loaded) void el.play().catch(() => {})
        else el.pause()
      },
      { rootMargin: '200px 0px', threshold: [0, 0.5] },
    )
    seen.observe(el)
    return () => seen.disconnect()
  }, [src])
  return (
    <video
      ref={video}
      className={cn('block aspect-video h-auto w-full rounded-xl border border-border bg-card shadow-card-soft', className)}
      poster={`${src}.jpg`}
      aria-label={label}
      muted
      loop
      playsInline
      preload="none"
    />
  )
}
