import { TriangleAlert } from 'lucide-react'
import { Banner } from '@/components/ui/banner'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { RuntimeInfo } from '@/lib/api/types'
import { AGENTS_OWN } from '../model/launch'
import { Label } from '@/components/ui/label'
import { ink } from '@/components/ui/intents'

/** How a new session starts: its permission mode (the runtime's own list; by default what the daemon is set
 *  to, else the agent's own settings) and, under Advanced, extra arguments. Warns of a mode that asks
 *  nothing or has no sandbox. */
export function LaunchOptions({
  runtime,
  mode,
  onMode,
  extra,
  onExtra,
}: {
  runtime: RuntimeInfo | undefined
  mode: string | null
  onMode: (mode: string | null) => void
  extra: string
  onExtra: (extra: string) => void
}) {
  const modes = runtime?.permission_modes ?? []
  const fallback = runtime?.default_mode ?? AGENTS_OWN
  const shown = mode ?? fallback
  const dangerous = modes.find((m) => m.id === shown)?.dangerous
  const label = (id: string) =>
    id === AGENTS_OWN ? "Agent's default (from its own settings)" : (modes.find((m) => m.id === id)?.label ?? id)
  return (
    <>
      {modes.length ? (
        <Label>
          Permission mode
          <Select value={shown} onChange={(e) => onMode(e.target.value === fallback ? null : e.target.value)} aria-label="Permission mode">
            <option value={AGENTS_OWN}>{label(AGENTS_OWN)}</option>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.id === fallback ? ' (this daemon’s default)' : ''}
              </option>
            ))}
          </Select>
        </Label>
      ) : null}
      {dangerous ? (
        <Banner tone="warning">
          <TriangleAlert />
          <span>
            {label(shown)}: it runs commands without asking you. Only where a mistake costs nothing (a container, a throwaway checkout).
          </span>
        </Banner>
      ) : null}
      <details className={ink.body}>
        <summary className={`${ink.quiet} cursor-pointer`}>Advanced</summary>
        <label className={`${ink.strong} mt-2 flex flex-col gap-1.5`}>
          Extra arguments <span className={ink.aside}>for {runtime?.binary ?? 'the agent'}, after the daemon's defaults</span>
          <Input
            value={extra}
            onChange={(e) => onExtra(e.target.value)}
            placeholder="--model opus"
            className={ink.code}
            spellCheck={false}
            autoCapitalize="off"
          />
        </label>
      </details>
    </>
  )
}
