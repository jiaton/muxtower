import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './button'

/** How long a copy button says "Copied". */
export const COPIED_MS = 1500

/** Puts text on the clipboard: the Clipboard API where the page may use it, else the older copy command
 *  (a page served over plain http on the LAN has no `navigator.clipboard`). */
export async function copyText(text: string): Promise<boolean> {
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

/** A small icon button that copies `text` (a path, an id) and shows a check for a moment once it did.
 *  `label` names it to a screen reader and as its tooltip ("Copy the session id"). Not `CodeBlock`'s
 *  buttons: those copy the block they sit on. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  const name = copied ? 'Copied' : label
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      tone={copied ? 'accent' : undefined}
      aria-label={name}
      title={name}
      onClick={async () => {
        if (await copyText(text)) setCopied(true)
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  )
}
