import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { ink, look } from '@/components/ui/intents'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/client'
import { useTriggers, useUpdateTrigger } from '../api/use-triggers'
import { NewTriggerDialog, TriggerDialog } from './trigger-dialog'
import { TriggerRow } from './trigger-row'

/**
 * The hub's triggers, in its settings: events from outside (a webhook, a script's `muxtower trigger`) that
 * reach a session, start one, or notify. Each with its last firing; a tap opens its settings, a test and
 * its log.
 */
export function TriggersSettings({ daemonId }: { daemonId: string }) {
  const triggers = useTriggers(daemonId)
  const toggle = useUpdateTrigger(daemonId)
  const [open, setOpen] = useState<string | 'new' | null>(null)
  const shown = open && open !== 'new' ? triggers.data?.find((t) => t.id === open) : undefined
  // A daemon from before triggers: nothing to show.
  if (triggers.error instanceof ApiError && triggers.error.status === 404) return null
  return (
    <section aria-label="Triggers" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className={ink.eyebrow}>Triggers</h2>
        <Button variant="outline" size="sm" onClick={() => setOpen('new')}>
          <Plus />
          New trigger
        </Button>
      </div>
      <p className={ink.hint}>Events from outside (a webhook, a script) that message a session, start one, or notify you.</p>
      {triggers.error ? <Banner tone="error">{triggers.error.message}</Banner> : null}
      {toggle.error ? <Banner tone="error">{toggle.error.message}</Banner> : null}
      {triggers.data ? (
        triggers.data.length ? (
          <ul className={`${look.list} flex flex-col`}>
            {triggers.data.map((t) => (
              <TriggerRow
                key={t.id}
                trigger={t}
                onOpen={() => setOpen(t.id)}
                toggling={toggle.isPending && toggle.variables?.id === t.id}
                onToggle={() => toggle.mutate({ id: t.id, patch: { enabled: !t.enabled, clear_dedupe: false, clear_rate: false } })}
              />
            ))}
          </ul>
        ) : (
          <p className={`${look.panel} ${ink.hint} p-3`}>No triggers yet.</p>
        )
      ) : triggers.isPending ? (
        <Skeleton shape="block" />
      ) : null}
      {open === 'new' ? <NewTriggerDialog daemonId={daemonId} onClose={() => setOpen(null)} /> : null}
      {shown ? <TriggerDialog daemonId={daemonId} trigger={shown} onClose={() => setOpen(null)} /> : null}
    </section>
  )
}
