import { Plus, SendHorizontal } from 'lucide-react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { useSendInput } from '../api/use-terminal'
import { useDrafts, useTerminalPrefs } from '../store'
import { KeyPad } from './key-pad'

/** One row: the keys toggle, the message box (sent followed by Enter) and Send. The keys a phone
 *  keyboard lacks open above it, and stay open or closed as last left. What is typed is kept per session
 *  until it is sent (`useDrafts`). `keys`: the key names this session accepts; empty means all of them. */
export function InputBar({ daemonId, sessionId, keys = [] }: { daemonId: string; sessionId: string; keys?: string[] }) {
  const send = useSendInput(daemonId, sessionId)
  const draftKey = `${daemonId}/${sessionId}`
  const text = useDrafts((s) => s.drafts[draftKey] ?? '')
  const setDraft = useDrafts((s) => s.setDraft)
  const setText = (value: string) => setDraft(draftKey, value)
  const open = useTerminalPrefs((s) => s.keypad)
  const setOpen = useTerminalPrefs((s) => s.setKeypad)

  const submit = () => {
    if (!text.trim()) return
    const sent = text
    // Typed on while it was sending: keep what is newer.
    send.mutate(
      { text, enter: true },
      {
        onSuccess: () => {
          if (useDrafts.getState().drafts[draftKey] === sent) setText('')
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {send.isError ? <Banner tone="error">{send.error.message}</Banner> : null}
      {open ? <KeyPad keys={keys} onKey={(key) => send.mutate({ key })} /> : null}
      <form
        className="flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={open ? 'Hide keys' : 'Show keys'}
          aria-expanded={open}
          title={open ? 'Hide keys' : 'Keys: esc, tab, arrows, enter…'}
          className={cn('shrink-0', open && 'bg-surface-muted text-fg')}
          onPointerDown={(e) => e.preventDefault()} // keep the phone keyboard as it is
          onClick={() => setOpen(!open)}
        >
          <Plus className={cn('transition-transform', open && 'rotate-45')} />
        </Button>
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
        <Button type="submit" size="icon" className="shrink-0" aria-label="Send" disabled={send.isPending || !text.trim()}>
          <SendHorizontal />
        </Button>
      </form>
    </div>
  )
}
