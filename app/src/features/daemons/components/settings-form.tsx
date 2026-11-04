import { FileLock2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import type { SettingView } from '@/lib/api/types'
import { useChangeSettings, useMachineSettings } from '../api/use-settings'

/** The settings in their sections, in the order the daemon lists them. */
export function sectionsOf(settings: SettingView[]): { section: string; settings: SettingView[] }[] {
  const sections = new Map<string, SettingView[]>()
  for (const s of settings) sections.set(s.section, [...(sections.get(s.section) ?? []), s])
  return [...sections].map(([section, list]) => ({ section, settings: list }))
}

/** A machine's feature settings. Each change is sent as it is made; one the config file sets is shown
 *  as set there and cannot be changed here; one that needs a restart says so until the daemon restarts. */
export function SettingsForm({ daemonId, node }: { daemonId: string; node?: string }) {
  const listed = useMachineSettings(daemonId, node)
  const change = useChangeSettings(daemonId, node)
  if (listed.error) return <Banner tone="error">{listed.error.message}</Banner>
  if (!listed.data) return <p className="text-sm text-fg-muted">Loading…</p>
  const { machine, settings } = listed.data
  const pending = settings.filter((s) => s.pending)
  const set = (key: string, value: unknown) => change.mutate({ [key]: value })

  return (
    <div className="flex flex-col gap-5">
      {pending.length ? (
        <Banner tone="warning">
          <RotateCcw />
          <span>
            {pending.length === 1 ? `${pending[0].label} applies` : `${pending.length} changes apply`} when muxtower restarts on {machine}
            : restart its service, or stop <code className="font-mono">muxtower serve</code> and start it again.
          </span>
        </Banner>
      ) : null}
      {change.error ? <Banner tone="error">{change.error.message}</Banner> : null}
      {sectionsOf(settings).map(({ section, settings: list }) => (
        <section key={section} aria-label={section} className="flex flex-col gap-1">
          <h2 className="text-xs font-medium tracking-wide text-fg-muted uppercase">{section}</h2>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
            {list.map((s) => (
              <SettingRow key={s.key} setting={s} busy={change.isPending} onChange={(value) => set(s.key, value)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function SettingRow({ setting: s, busy, onChange }: { setting: SettingView; busy: boolean; onChange: (value: unknown) => void }) {
  const locked = s.source === 'config_file'
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{s.label}</p>
        <p className="text-xs text-fg-muted">
          {locked ? (
            <span className="inline-flex items-center gap-1">
              <FileLock2 className="size-3" aria-hidden /> Set by the config file (<code className="font-mono">{s.key}</code>)
            </span>
          ) : (
            [s.help, s.pending ? 'applies after a restart' : null].filter(Boolean).join(' · ')
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Control setting={s} disabled={locked || busy} onChange={onChange} />
        {s.source === 'app' ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Back to the default for ${s.label}`} title="Back to the default" onClick={() => onChange(null)}>
            <RotateCcw />
          </Button>
        ) : null}
      </div>
    </li>
  )
}

function Control({ setting: s, disabled, onChange }: { setting: SettingView; disabled: boolean; onChange: (value: unknown) => void }) {
  if (s.kind === 'bool')
    return <Switch checked={Boolean(s.value)} disabled={disabled} onCheckedChange={onChange} aria-label={s.label} />
  if (s.kind === 'choice')
    return disabled ? (
      <span className="text-sm">{String(s.value)}</span>
    ) : (
      <Segmented aria-label={s.label} value={String(s.value)} options={s.choices.map((c) => ({ value: c, label: c }))} onChange={onChange} />
    )
  return <TextControl key={String(s.value)} setting={s} disabled={disabled} onChange={onChange} />
}

/** A number or a text, sent once typed (Enter or leaving the box), not on every key. */
function TextControl({ setting: s, disabled, onChange }: { setting: SettingView; disabled: boolean; onChange: (value: unknown) => void }) {
  const shown = s.value === null || s.value === undefined ? '' : String(s.value)
  const [draft, setDraft] = useState(shown)
  const commit = () => {
    if (draft.trim() === shown) return
    onChange(s.kind === 'number' ? (draft.trim() === '' ? null : Number(draft)) : draft.trim())
  }
  return (
    <Input
      className="h-8 w-40"
      inputMode={s.kind === 'number' ? 'decimal' : undefined}
      value={draft}
      placeholder={s.default === null || s.default === undefined ? 'default' : String(s.default)}
      disabled={disabled}
      aria-label={s.label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}
