import { useMemo } from 'react'
import { Banner } from '@/components/ui/banner'
import { Input, Textarea } from '@/components/ui/input'
import { ink } from '@/components/ui/intents'
import { Label, LabelNote } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { SuggestInput } from '@/components/ui/suggest-input'
import { Button } from '@/components/ui/button'
import type { RuntimeInfo, Session, StartMode } from '@/lib/api/types'
import type { Draft } from '../model/draft'
import { resolvedText, runsUnguarded, sessionsFor, targetsOf } from '../model/targets'

export const BYPASS_WARNING = "This session gets outside data; don't run it in bypass mode."

const tally = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))].map((value) => ({ value }))

interface Props {
  draft: Draft
  set: (patch: Partial<Draft>) => void
  errors: Partial<Record<string, string>>
  sessions: Session[]
  runtimes: RuntimeInfo[]
  machines: string[]
  hub: string
  /** the mode a started session runs in, per runtime (`useStartModes`) */
  modes?: StartMode[]
  /** shows the setting that decides it (Settings › Triggers) */
  onShowSetting?: () => void
}

/** Deliver: which session gets each firing, and a warning when it acts without asking. */
export function DeliverFields({ draft, set, errors, sessions, runtimes }: Props) {
  const targets = useMemo(() => targetsOf(sessions), [sessions])
  const found = sessionsFor(draft.to, sessions)
  const unguarded = found.some((s) => runsUnguarded(s, runtimes))
  return (
    <>
      <Label>
        To
        <SuggestInput
          placeholder="role@project, or a session id"
          value={draft.to}
          onValueChange={(to) => set({ to })}
          suggestions={targets}
          aria-invalid={!!errors.to}
        />
        {errors.to ? (
          <span className={ink.noteDanger}>{errors.to}</span>
        ) : draft.to.trim() ? (
          <span className={ink.meta}>{found.length ? resolvedText(found) : 'No such session or role yet: it gets firings once there is one.'}</span>
        ) : null}
      </Label>
      {unguarded ? <Banner tone="warning">{BYPASS_WARNING}</Banner> : null}
    </>
  )
}

/** Start: a new session per firing, where and as what, and what it is told. */
export function StartFields({ draft, set, errors, sessions, runtimes, machines, hub, modes = [], onShowSetting }: Props) {
  const usable = runtimes.filter((r) => r.available && !r.headless)
  const mode = modes.find((m) => m.runtime === draft.runtime)
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Label>
          Machine
          <Select value={draft.machine} onChange={(e) => set({ machine: e.target.value })}>
            <option value="">{hub} (the hub)</option>
            {machines.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Label>
        <Label>
          Agent
          <Select value={draft.runtime} onChange={(e) => set({ runtime: e.target.value })}>
            {(usable.length ? usable.map((r) => r.name) : ['claude-code']).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      <Label>
        <span>
          Folder <LabelNote>optional: else its default</LabelNote>
        </span>
        <Input placeholder="~/code/project" value={draft.cwd} onChange={(e) => set({ cwd: e.target.value })} />
      </Label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Label>
          <span>
            Role <LabelNote>optional</LabelNote>
          </span>
          <SuggestInput placeholder="triage" value={draft.role} onValueChange={(role) => set({ role })} suggestions={tally(sessions.map((s) => s.team_role))} />
        </Label>
        <Label>
          <span>
            Project <LabelNote>optional</LabelNote>
          </span>
          <SuggestInput
            placeholder="owner/repo"
            value={draft.project}
            onValueChange={(project) => set({ project })}
            suggestions={tally(sessions.map((s) => s.project))}
          />
        </Label>
      </div>
      <Label>
        Message
        <Textarea code rows={4} value={draft.message} onChange={(e) => set({ message: e.target.value })} aria-invalid={!!errors.message} />
        <span className={ink.meta}>
          {'{payload}'} and {'{field.path}'} are filled in as data, below the message, never as instructions.
        </span>
        {errors.message ? <span className={ink.noteDanger}>{errors.message}</span> : null}
      </Label>
      {mode ? (
        <p className={ink.meta}>
          Starts in: <span className={ink.strong}>{mode.label}</span>
          {mode.held ? ` (the default: ${mode.held})` : null}
          {onShowSetting ? (
            <>
              {' · '}
              <Button variant="link" size="xs" onClick={onShowSetting}>
                Settings › Triggers
              </Button>
            </>
          ) : null}
        </p>
      ) : null}
      <p className={ink.meta}>At most 3 of its sessions run at once, never above the default mode unless agents may start them so.</p>
    </>
  )
}

export function NotifyFields() {
  return <p className={ink.hint}>Each firing that gets through sends a notification to your devices, with what came in.</p>
}
