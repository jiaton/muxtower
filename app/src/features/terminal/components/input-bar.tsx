import { SendHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { useSendInput } from '../api/use-terminal'

const KEYS: Array<{ key: string; label: string; name: string }> = [
  { key: 'Escape', label: 'Esc', name: 'Escape' },
  { key: 'Tab', label: 'Tab', name: 'Tab' },
  { key: 'BTab', label: '⇧Tab', name: 'Shift Tab' },
  { key: 'Up', label: '↑', name: 'Up' },
  { key: 'Down', label: '↓', name: 'Down' },
  { key: 'Enter', label: '⏎', name: 'Enter' },
  { key: 'C-c', label: '^C', name: 'Control C' },
]

/** Text box (sent followed by Enter) plus the keys an agent's TUI needs that a phone keyboard lacks. */
/** `keys`: the key names this session accepts; empty means all of them. */
export function InputBar({ daemonId, sessionId, keys = [] }: { daemonId: string; sessionId: string; keys?: string[] }) {
  const send = useSendInput(daemonId, sessionId)
  const [text, setText] = useState('')

  const submit = () => {
    if (!text.trim()) return
    send.mutate({ text, enter: true }, { onSuccess: () => setText('') })
  }

  return (
    <div className="flex flex-col gap-2">
      {send.isError ? <Banner tone="error">{send.error.message}</Banner> : null}
      <div className="flex gap-1 overflow-x-auto" role="toolbar" aria-label="Keys">
        {KEYS.filter((k) => keys.length === 0 || keys.includes(k.key)).map((k) => (
          <Button
            key={k.key}
            variant="secondary"
            size="sm"
            className="min-w-11 font-mono"
            aria-label={k.name}
            onClick={() => send.mutate({ key: k.key })}
          >
            {k.label}
          </Button>
        ))}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Textarea
          rows={1}
          value={text}
          placeholder="Message the agent"
          aria-label="Message the agent"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          className="max-h-40 field-sizing-content"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={send.isPending || !text.trim()}>
          <SendHorizontal />
        </Button>
      </form>
    </div>
  )
}
