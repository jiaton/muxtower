import { ArrowDown } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import type { ConversationItem } from '@/lib/api/types'
import { cn } from '@/lib/cn'

const BOTTOM_SLACK = 24

/** Runs of tool calls fold into one line ("Bash make · Read app.ts · …") so the prose stays readable. */
type Row = { kind: 'item'; item: ConversationItem } | { kind: 'tools'; items: ConversationItem[] }

function rows(items: ConversationItem[]): Row[] {
  const out: Row[] = []
  for (const item of items) {
    const last = out[out.length - 1]
    if (item.kind === 'tool' && last?.kind === 'tools') last.items.push(item)
    else if (item.kind === 'tool') out.push({ kind: 'tools', items: [item] })
    else if (item.kind !== 'result') out.push({ kind: 'item', item })
  }
  return out
}

const toolLabel = (t: ConversationItem) => `${t.tool_name ?? 'tool'}${t.text ? ` ${t.text.split('\n')[0].slice(0, 60)}` : ''}`

function ItemView({ item }: { item: ConversationItem }) {
  if (item.kind === 'prompt')
    return <p className="self-end rounded-lg bg-accent px-3 py-2 whitespace-pre-wrap text-accent-fg">{item.text}</p>
  if (item.kind === 'reply') return <Markdown>{item.text ?? ''}</Markdown>
  const label = item.kind === 'question' ? 'Question' : (item.tool_name ?? 'Approval')
  return (
    <div className="rounded-md border border-state-permission px-3 py-2 text-sm">
      <p className="font-medium">
        {label} · <span className="text-fg-muted">{item.status}</span>
      </p>
      {item.text ? <pre className="mt-1 font-mono text-xs whitespace-pre-wrap">{item.text}</pre> : null}
    </div>
  )
}

/** The conversation as readable text: prompts, replies, folded tool runs, prompts to answer. Follows new
 *  items while at the bottom; holds still while the reader is scrolled up. */
export function ConversationView({ items }: { items: ConversationItem[] }) {
  const box = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [behind, setBehind] = useState(false)
  const shown = rows(items)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    if (atBottom.current) el.scrollTop = el.scrollHeight
    else setBehind(true)
  }, [items])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <div
        ref={box}
        role="log"
        aria-label="Conversation"
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3 text-sm"
        onScroll={() => {
          const el = box.current!
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK
          if (atBottom.current) setBehind(false)
        }}
      >
        {shown.length === 0 ? <p className="text-fg-muted">No messages yet.</p> : null}
        {shown.map((row) =>
          row.kind === 'tools' ? (
            <p key={`t${row.items[0].seq}`} className="font-mono text-xs text-fg-muted">
              {row.items.map((t) => (
                <span key={t.seq} className={cn(t.status === 'error' && 'text-danger')}>
                  ◆ {toolLabel(t)}{' '}
                </span>
              ))}
            </p>
          ) : (
            <ItemView key={row.item.seq} item={row.item} />
          ),
        )}
      </div>
      {behind ? (
        <Button
          size="sm"
          variant="secondary"
          className="absolute right-3 bottom-3 shadow-card"
          onClick={() => {
            const el = box.current!
            el.scrollTop = el.scrollHeight
            atBottom.current = true
            setBehind(false)
          }}
        >
          <ArrowDown /> New messages
        </Button>
      ) : null}
    </div>
  )
}
