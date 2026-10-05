import { useEffect } from 'react'

/** Mirrors the OS color scheme onto <html data-theme>, which tokens.css keys dark mode on. */
export function useColorScheme() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => (document.documentElement.dataset.theme = media.matches ? 'dark' : 'light')
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])
}
