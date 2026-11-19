import { Check, Copy } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type ComponentType } from 'react'
import { cn } from '@/lib/cn'
import { box, focusRing, text } from './styles'

/** A snippet shown on its own, to be copied (not inside Markdown): small machine text on a quiet ground,
 *  every line wrapped wherever it must break (nothing hidden past the edge), and under it, at its right, a
 *  Copy button that says so in words, always shown. */
const SNIPPET = cn(box({ radius: 'sm', ground: 'muted' }), text({ mono: true, size: 'xs' }), 'p-2 pb-10 break-all whitespace-pre-wrap')
const SNIPPET_BUTTON = `inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-fg hover:bg-surface-muted ${focusRing} [&_svg]:size-3.5`

const COPIED_MS = 1500

/** One more thing a code block offers beside Copy, given by whoever shows the Markdown (e.g. to put the
 *  code in a message box). */
export interface CodeAction {
  label: string
  icon: ComponentType<{ 'aria-hidden'?: boolean }>
  onAction: (code: string) => void
}

/** The code blocks inside it offer this action too; none outside one. */
export const CodeActionContext = createContext<CodeAction | null>(null)

const CORNER_BUTTON = `inline-flex size-7 items-center justify-center rounded-md border border-border bg-surface text-fg-muted hover:text-fg ${focusRing} [&_svg]:size-3.5`

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

/** A code block with a Copy button in its corner (and the `CodeActionContext` action beside it): always
 *  shown on a touch screen, on hover or focus where there is a pointer. The buttons stay put while the
 *  code scrolls sideways under them. */
export function CodeBlock({
  node: _node,
  className,
  snippet,
  copyLabel = 'Copy code',
  ...props
}: ComponentProps<'pre'> & {
  node?: unknown
  snippet?: boolean
  /** what Copy is called to a screen reader, where several blocks are shown ("Copy the secret") */
  copyLabel?: string
}) {
  const pre = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const action = useContext(CodeActionContext)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const code = () => (pre.current?.textContent ?? '').replace(/\n$/, '')
  const copy = async () => {
    const text = code()
    if (text && (await copyText(text))) setCopied(true)
  }

  if (snippet)
    return (
      <div className="relative min-w-0">
        <pre ref={pre} className={cn(SNIPPET, className)} {...props} />
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'Copied' : copyLabel}
          className={cn(SNIPPET_BUTTON, 'absolute right-1 bottom-1', copied && 'text-success')}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    )

  return (
    <div className="group relative min-w-0">
      <pre ref={pre} className={className} {...props} />
      <div
        className={cn(
          'absolute top-1 right-1 flex gap-1 transition-opacity',
          '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100',
          copied && '[@media(hover:hover)]:opacity-100',
        )}
      >
        {action ? (
          <button
            type="button"
            onClick={() => action.onAction(code())}
            aria-label={action.label}
            title={action.label}
            className={CORNER_BUTTON}
          >
            <action.icon aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'Copied' : copyLabel}
          title={copied ? 'Copied' : copyLabel}
          className={cn(CORNER_BUTTON, copied && 'text-success')}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </button>
      </div>
    </div>
  )
}
