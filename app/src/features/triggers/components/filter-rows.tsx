import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ink } from '@/components/ui/intents'
import { Select } from '@/components/ui/select'
import type { TriggerCondition } from '@/lib/api/types'
import { MAX_FILTERS } from '../model/draft'

const OPS: { value: TriggerCondition['op']; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'contains', label: 'contains' },
  { value: 'regex', label: 'matches regex' },
]

/** The payload tests a firing must pass, all of them: a field, how it is compared, a value. */
export function FilterRows({ value, onChange }: { value: TriggerCondition[]; onChange: (next: TriggerCondition[]) => void }) {
  const set = (i: number, patch: Partial<TriggerCondition>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={ink.label}>Filters</legend>
      <p className={ink.meta}>
        {value.length ? 'A firing goes on only when every one holds.' : 'None: every firing goes on.'} A field is a dotted path into the
        JSON payload, like deal.price.
      </p>
      {value.map((c, i) => (
        <div key={i} className="grid grid-cols-[7rem_1fr_auto] gap-1 sm:grid-cols-[1fr_8rem_1fr_auto]" role="group" aria-label={`Filter ${i + 1}`}>
          <Input aria-label="Field" className="col-span-2 sm:col-span-1" placeholder="field.path" value={c.field} onChange={(e) => set(i, { field: e.target.value })} />
          <Button
            variant="ghost"
            size="icon"
            className="sm:order-last"
            aria-label={`Remove filter ${i + 1}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <X />
          </Button>
          <Select aria-label="Test" value={c.op} onChange={(e) => set(i, { op: e.target.value as TriggerCondition['op'] })}>
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Value"
            className="col-span-2 sm:col-span-1"
            placeholder={c.op === 'regex' ? '^urgent' : 'value'}
            value={c.value}
            onChange={(e) => set(i, { value: e.target.value })}
          />
        </div>
      ))}
      {value.length < MAX_FILTERS ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange([...value, { field: '', op: 'equals', value: '' }])}>
          <Plus />
          Add a filter
        </Button>
      ) : (
        <p className={ink.meta}>{MAX_FILTERS} filters at most.</p>
      )}
    </fieldset>
  )
}
