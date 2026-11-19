import { useState, type ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ink } from '@/components/ui/intents'
import { Label, LabelNote } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { useDaemon } from '@/lib/daemons/store'
import { useNodeNames } from '@/lib/daemons/use-nodes'
import { useSessionEntries } from '@/features/sessions/hooks/use-session-entries'
import { useRuntimes } from '@/features/sessions/api/use-session-mutations'
import { useStartModes } from '../api/use-triggers'
import { problems, type Draft } from '../model/draft'
import { DeliverFields, NotifyFields, StartFields } from './action-fields'
import { FilterRows } from './filter-rows'

const KINDS: { value: Draft['kind']; label: string }[] = [
  { value: 'deliver', label: 'Deliver to a session' },
  { value: 'start', label: 'Start a session' },
  { value: 'notify', label: 'Notify' },
]

/** A trigger's settings: its name, what it does with a firing, which firings it lets through. Nothing is
 *  said wrong until a save is tried. */
export function TriggerForm({
  daemonId,
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  footer,
  onShowSetting,
}: {
  daemonId: string
  initial: Draft
  submitLabel: string
  pending: boolean
  error: Error | null
  onSubmit: (draft: Draft) => void
  /** more actions beside Save (Delete) */
  footer?: ReactNode
  /** shows the setting a start action's mode comes from (the dialog closes first) */
  onShowSetting?: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const daemon = useDaemon(daemonId)
  const sessions = useSessionEntries()
    .entries.filter((e) => e.daemon.id === daemonId)
    .map((e) => e.session)
  const runtimes = useRuntimes(daemonId).data ?? []
  const modes = useStartModes(daemonId).data ?? []
  const machines = useNodeNames(daemonId)
  const found = problems(draft)
  const errors = tried ? found : {}
  const fields = { draft, set, errors, sessions, runtimes, machines, hub: daemon?.name ?? 'hub', modes, onShowSetting }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!Object.keys(found).length) onSubmit(draft)
      }}
    >
      <Label>
        Name
        <Input
          placeholder="deploy-failed"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={!!errors.name}
        />
        <span className={errors.name ? ink.noteDanger : ink.meta}>{errors.name ?? 'Lowercase letters, digits, - and _: what muxtower trigger takes.'}</span>
      </Label>
      <div className="flex flex-col gap-2">
        <span className={ink.label}>Action</span>
        <Segmented aria-label="Action" value={draft.kind} options={KINDS} onChange={(kind) => set({ kind })} />
      </div>
      {draft.kind === 'deliver' ? <DeliverFields {...fields} /> : draft.kind === 'start' ? <StartFields {...fields} /> : <NotifyFields />}
      <FilterRows value={draft.filter} onChange={(filter) => set({ filter })} />
      {errors.filter ? <span className={ink.noteDanger}>{errors.filter}</span> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className={ink.label}>Limits</legend>
        <label className="flex items-center justify-between gap-2">
          <span className={ink.body}>Drop repeats</span>
          <Switch checked={draft.dedupe} onCheckedChange={(dedupe) => set({ dedupe })} aria-label="Drop repeats" />
        </label>
        {draft.dedupe ? (
          <div className="flex flex-col gap-2">
            <Segmented
              aria-label="Repeats are told by"
              value={draft.dedupeBy}
              options={[
                { value: 'field', label: 'A payload field' },
                { value: 'key', label: "The firing's key" },
              ]}
              onChange={(dedupeBy) => set({ dedupeBy })}
            />
            {draft.dedupeBy === 'field' ? (
              <Input aria-label="Dedupe field" placeholder="id" value={draft.dedupeField} onChange={(e) => set({ dedupeField: e.target.value })} />
            ) : (
              <p className={ink.meta}>The key is ?key= on the URL, or --key on the command line.</p>
            )}
            <label className="flex items-center gap-2">
              <span className={ink.body}>Within</span>
              <Input
                className="w-20"
                inputMode="numeric"
                value={draft.dedupeDays}
                onChange={(e) => set({ dedupeDays: e.target.value })}
                aria-label="Days"
                aria-invalid={!!errors.dedupe}
              />
              <span className={ink.body}>days</span>
            </label>
            <span className={errors.dedupe ? ink.noteDanger : ink.meta}>{errors.dedupe ?? 'A firing whose key was seen within these days is dropped.'}</span>
          </div>
        ) : null}
        <Label>
          <span>
            Rate per hour <LabelNote>optional</LabelNote>
          </span>
          <Input
            inputMode="numeric"
            placeholder="No limit"
            value={draft.rate}
            onChange={(e) => set({ rate: e.target.value })}
            aria-invalid={!!errors.rate}
          />
          {errors.rate ? <span className={ink.noteDanger}>{errors.rate}</span> : null}
        </Label>
      </fieldset>
      {error ? <Banner tone="error">{error.message}</Banner> : null}
      <div className="flex items-center gap-2">
        {footer}
        <Button type="submit" className="ml-auto" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
