import { useEffect } from 'react'

/** Fades each `[data-reveal]` band in as it scrolls into view (styles in `site.css`). Without JS, or with
 *  reduced motion, nothing is hidden: the `reveal` class on <html> is what hides a band until it is shown. */
export function useReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const root = document.documentElement
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-shown', '')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    root.classList.add('reveal')
    for (const el of document.querySelectorAll('[data-reveal]:not([data-shown])')) observer.observe(el)
    return () => {
      observer.disconnect()
      root.classList.remove('reveal')
    }
  }, [])
}
