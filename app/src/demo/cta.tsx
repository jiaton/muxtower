import { ArrowUpRight, X } from 'lucide-react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/components/ui/button'

/** The hosted app the demo points to, as the build names it (`MUXTOWER_DEMO_APP_URL`); null without one. */
export function appUrl(doc: Document = document): string | null {
  return doc.querySelector<HTMLMetaElement>('meta[name="muxtower-app-url"]')?.content.trim() || null
}

/** A small card over the demo: these sessions are made up, and here is the app for your own daemon. */
export function DemoCta({ url }: { url: string }) {
  const [shown, setShown] = useState(true)
  if (!shown) return null
  return (
    <aside
      aria-label="About this demo"
      className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-surface py-2 pr-2 pl-4 text-sm shadow-card max-md:inset-x-3 max-md:bottom-20"
    >
      <span className="flex-1 whitespace-nowrap text-fg-muted">
        Demo<span className="max-md:hidden">: made-up sessions.</span>
      </span>
      <Button asChild size="sm">
        <a href={url} target="_blank" rel="noreferrer">
          Connect your own daemon
          <ArrowUpRight />
        </a>
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Hide" onClick={() => setShown(false)}>
        <X />
      </Button>
    </aside>
  )
}

/** Puts the card on the page, beside the app, when the build names where it goes. */
export function mountCta() {
  const url = appUrl()
  if (!url) return
  const host = document.createElement('div')
  document.body.append(host)
  createRoot(host).render(<DemoCta url={url} />)
}
