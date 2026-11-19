import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { ink, look } from '@/components/ui/intents'
import { Label, LabelNote } from '@/components/ui/label'
import type { Trigger } from '@/lib/api/types'
import { useTestFire } from '../api/use-triggers'
import { FiringLine } from './firing-log'

/** A payload to start from: the fields its filters and dedupe read, filled with made-up values. */
function sample(trigger: Trigger): string {
  const out: Record<string, unknown> = { title: 'Example event' }
  const put = (path: string, value: string) => {
    const keys = path.split('.').filter(Boolean)
    let at = out
    keys.forEach((k, i) => {
      if (i === keys.length - 1) at[k] = value
      else at = (at[k] = typeof at[k] === 'object' && at[k] ? at[k] : {}) as Record<string, unknown>
    })
  }
  for (const c of trigger.filter ?? []) put(c.field, c.op === 'regex' ? 'example' : c.value)
  if (trigger.dedupe?.field) put(trigger.dedupe.field, 'example-1')
  return JSON.stringify(out, null, 2)
}

/** Fires it with a sample payload, through its filters, limits and action, as a firing marked "test". */
export function TestPanel({ daemonId, trigger }: { daemonId: string; trigger: Trigger }) {
  const fire = useTestFire(daemonId)
  const [text, setText] = useState(() => sample(trigger))
  const [key, setKey] = useState('')
  let parsed: { ok: true; value: unknown } | { ok: false; error: string }
  try {
    parsed = { ok: true, value: JSON.parse(text) }
  } catch (e) {
    parsed = { ok: false, error: e instanceof Error ? e.message : 'not JSON' }
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (parsed.ok) fire.mutate({ id: trigger.id, payload: parsed.value, key: key.trim() || null })
      }}
    >
      <p className={ink.hint}>
        A test goes through its filters, its limits and its action, like a real event{trigger.enabled ? '' : ' (paused: it is logged as paused)'}.
      </p>
      <Label>
        Sample payload
        <Textarea code rows={7} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!parsed.ok} spellCheck={false} />
        {parsed.ok ? null : <span className={ink.noteDanger}>Not JSON: {parsed.error}</span>}
      </Label>
      <Label>
        <span>
          Key <LabelNote>optional: what ?key= would send</LabelNote>
        </span>
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="event-1" />
      </Label>
      {fire.error ? <Banner tone="error">{fire.error.message}</Banner> : null}
      <Button type="submit" className="self-end" disabled={!parsed.ok || fire.isPending}>
        Fire test
      </Button>
      {fire.data ? (
        <section aria-label="Test result" className="flex flex-col gap-1">
          <h3 className={ink.eyebrow}>Result</h3>
          <ul className={`${look.frame} flex flex-col px-3`}>
            <FiringLine firing={fire.data} />
          </ul>
        </section>
      ) : null}
    </form>
  )
}
