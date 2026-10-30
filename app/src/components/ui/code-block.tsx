import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { cn } from '@/lib/cn'

const COPIED_MS = 1500

/** Puts text on the clipboard: the Clipboard API where the page may use it, else the older copy command
 *  (a page served over plain http on the LAN has no `navigator.clipboard`). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // refused (no permission, not focused): try the older way
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

/** A code block with a Copy button in its corner: always shown on a touch screen, on hover or focus where
 *  there is a pointer. The button stays put while the code scrolls sideways under it. */
export function CodeBlock({ node: _node, className, ...props }: ComponentProps<'pre'> & { node?: unknown }) {
  const pre = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    const text = (pre.current?.textContent ?? '').replace(/\n$/, '')
    if (text && (await copyText(text))) setCopied(true)
  }

  return (
    <div className="group relative min-w-0">
      <pre ref={pre} className={className} {...props} />
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy code'}
        title={copied ? 'Copied' : 'Copy code'}
        className={cn(
          'absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-md border border-border bg-surface text-fg-muted transition-opacity hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus [&_svg]:size-3.5',
          '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100',
          copied && 'text-success opacity-100 [@media(hover:hover)]:opacity-100',
        )}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </button>
    </div>
  )
}
