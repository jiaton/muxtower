import type { Trigger, TriggerAction, TriggerCondition, TriggerPatch, TriggerSpec } from '@/lib/api/types'
import { NAME_PATTERN } from './summary'

export const MAX_FILTERS = 8

/** What the editor holds while a trigger is written: every field as typed. */
export interface Draft {
  name: string
  kind: TriggerAction['kind']
  /** deliver: a session id or role@project */
  to: string
  /** start: '' for the hub itself */
  machine: string
  cwd: string
  role: string
  project: string
  message: string
  runtime: string
  filter: TriggerCondition[]
  dedupe: boolean
  /** what tells a repeat: a payload field, or the key the firing was sent with */
  dedupeBy: 'field' | 'key'
  dedupeField: string
  dedupeDays: string
  rate: string
}

export const EMPTY_DRAFT: Draft = {
  name: '',
  kind: 'deliver',
  to: '',
  machine: '',
  cwd: '',
  role: '',
  project: '',
  message: 'Something came in:\n\n{payload}',
  runtime: 'claude-code',
  filter: [],
  dedupe: false,
  dedupeBy: 'field',
  dedupeField: '',
  dedupeDays: '7',
  rate: '',
}

export function draftOf(t: Trigger): Draft {
  const a = t.action
  return {
    ...EMPTY_DRAFT,
    name: t.name,
    kind: a.kind,
    to: a.kind === 'deliver' ? a.to : '',
    ...(a.kind === 'start'
      ? { machine: a.machine ?? '', cwd: a.cwd ?? '', role: a.role ?? '', project: a.project ?? '', message: a.message, runtime: a.runtime }
      : {}),
    filter: t.filter ?? [],
    dedupe: !!t.dedupe,
    dedupeBy: t.dedupe && !t.dedupe.field ? 'key' : 'field',
    dedupeField: t.dedupe?.field ?? '',
    dedupeDays: String(t.dedupe?.days ?? 7),
    rate: t.rate_per_hour ? String(t.rate_per_hour) : '',
  }
}

const orNull = (s: string) => s.trim() || null
const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN)

/** What is wrong with it, said for the field it is about; nothing when it can be saved. */
export function problems(d: Draft): Partial<Record<'name' | 'to' | 'message' | 'filter' | 'dedupe' | 'rate', string>> {
  const out: ReturnType<typeof problems> = {}
  if (!d.name.trim()) out.name = 'Give it a name.'
  else if (!NAME_PATTERN.test(d.name.trim())) out.name = 'Lowercase letters, digits, - and _ only.'
  if (d.kind === 'deliver' && !d.to.trim()) out.to = 'Pick a session, or type role@project.'
  if (d.kind === 'start' && !d.message.trim()) out.message = 'Say what the new session should do.'
  if (d.filter.length > MAX_FILTERS) out.filter = `At most ${MAX_FILTERS} filters.`
  else if (d.filter.some((c) => !c.field.trim())) out.filter = 'Every filter needs a field.'
  if (d.dedupe && d.dedupeBy === 'field' && !d.dedupeField.trim()) out.dedupe = 'Name the payload field that tells a repeat.'
  else if (d.dedupe && !(whole(d.dedupeDays) >= 1)) out.dedupe = 'Days: a whole number, 1 or more.'
  if (d.rate.trim() && !(whole(d.rate) >= 1)) out.rate = 'A whole number, 1 or more, or empty for no limit.'
  return out
}

function actionOf(d: Draft): TriggerAction {
  if (d.kind === 'deliver') return { kind: 'deliver', to: d.to.trim() }
  if (d.kind === 'notify') return { kind: 'notify' }
  return {
    kind: 'start',
    machine: orNull(d.machine),
    cwd: orNull(d.cwd),
    role: orNull(d.role),
    project: orNull(d.project),
    message: d.message,
    runtime: d.runtime || 'claude-code',
  }
}

const filterOf = (d: Draft): TriggerCondition[] => d.filter.map((c) => ({ ...c, field: c.field.trim() }))
const dedupeOf = (d: Draft) => (d.dedupe ? { days: whole(d.dedupeDays), field: d.dedupeBy === 'field' ? orNull(d.dedupeField) : null } : null)

/** A new trigger, enabled. */
export function specOf(d: Draft): TriggerSpec {
  return {
    name: d.name.trim(),
    enabled: true,
    action: actionOf(d),
    filter: filterOf(d),
    dedupe: dedupeOf(d),
    rate_per_hour: d.rate.trim() ? whole(d.rate) : null,
  }
}

/** The whole of an edited trigger: limits taken away are cleared, not left as they were. */
export function patchOf(d: Draft): TriggerPatch {
  const dedupe = dedupeOf(d)
  const rate = d.rate.trim() ? whole(d.rate) : null
  return {
    name: d.name.trim(),
    action: actionOf(d),
    filter: filterOf(d),
    ...(dedupe ? { dedupe, clear_dedupe: false } : { clear_dedupe: true }),
    ...(rate ? { rate_per_hour: rate, clear_rate: false } : { clear_rate: true }),
  }
}
