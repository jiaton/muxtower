import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ink } from '@/components/ui/intents'
import { Input } from '@/components/ui/input'
import { Label, LabelNote } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import type { InboxItem, InboxPatch, OnDue } from '@/lib/api/types'
import { QUICK_DUE, dayFromToday, dayName, dueBody, dueParts } from '../model/due'
import type { InboxProject } from '../model/item'
import { HandPicker, useHandPick } from './hand-picker'

/** A due date being set: its day, an optional time ("HH:MM"), and what happens then (remind the owner, or
 *  hand it off to someone picked as in Hand to…). Starts as `item` has it. */
export function useDueDraft(item?: InboxItem) {
  const parts = item ? dueParts(item) : null
  const [day, setDay] = useState<Date | undefined>(parts?.day)
  const [time, setTime] = useState(parts?.time ?? '')
  const [onDue, setOnDue] = useState<OnDue>(item?.on_due ?? 'remind')
  const hand = useHandPick(item?.due_target?.project ?? item?.project ?? null, item?.due_target ?? null)
  const handTo = onDue === 'hand_off' ? hand.target : null
  return {
    day,
    setDay,
    time,
    setTime,
    onDue,
    setOnDue,
    hand,
    /** Whether it can be kept: a day, and whom to hand it to when that is what happens. */
    ready: Boolean(day) && (onDue === 'remind' || Boolean(handTo)),
    /** The fields to send for it (none without a day). */
    body: (): Pick<InboxPatch, 'due' | 'due_has_time' | 'on_due' | 'due_target'> =>
      day ? { ...dueBody(day, time || null), on_due: onDue, due_target: handTo } : {},
  }
}

export type DueDraft = ReturnType<typeof useDueDraft>

const sameDay = (a: Date | undefined, b: Date) => Boolean(a && a.toDateString() === b.toDateString())

const ON_DUE = [
  { value: 'remind' as const, label: 'Remind me' },
  { value: 'hand_off' as const, label: 'Hand off to…' },
]

/** The quick choices (Tomorrow, In a week, In 30 days), a month to pick any day from, an optional time, and
 *  what happens when it falls due. */
export function DueEditor({ draft, projects }: { draft: DueDraft; projects: InboxProject[] }) {
  const today = dayFromToday(0)
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Quick choices" className="flex flex-wrap gap-2">
        {QUICK_DUE.map((q) => {
          const day = dayFromToday(q.days)
          return (
            <Button key={q.label} variant="outline" size="sm" aria-pressed={sameDay(draft.day, day)} onClick={() => draft.setDay(day)}>
              {q.label}
            </Button>
          )
        })}
      </div>
      <DatePicker selected={draft.day} onSelect={draft.setDay} from={today} />
      <Label>
        <span>
          Time <LabelNote>optional</LabelNote>
        </span>
        <Input type="time" aria-label="Time" value={draft.time} onChange={(e) => draft.setTime(e.target.value)} />
      </Label>
      <div className="flex flex-col gap-1.5">
        <span className={ink.label}>When it falls due</span>
        <Segmented aria-label="When it falls due" value={draft.onDue} options={ON_DUE} onChange={draft.setOnDue} />
      </div>
      {draft.onDue === 'hand_off' ? <HandPicker pick={draft.hand} projects={projects} /> : null}
    </div>
  )
}

/** What the draft says, in a line: "Due Dec 25 at 5:00 PM", or that no day is picked. */
export function dueSummary(draft: DueDraft): string {
  if (!draft.day) return 'Pick a day.'
  const at = draft.time ? ` at ${draft.time}` : ''
  return `Due ${dayName(draft.day)}${at}`
}

/** Due date…: set it, change it or clear it. `onSave` gets the fields to send (a cleared one: `due` null). */
export function DueDialog({
  item,
  projects,
  onSave,
  onClose,
}: {
  item: InboxItem
  projects: InboxProject[]
  onSave: (patch: Pick<InboxPatch, 'due' | 'due_has_time' | 'on_due' | 'due_target'>) => void
  onClose: () => void
}) {
  const draft = useDueDraft(item)
  const save = (patch: Parameters<typeof onSave>[0]) => {
    onSave(patch)
    onClose()
  }
  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent title="Due date" description={<span className="line-clamp-2">“{item.text}”</span>}>
        <DueEditor draft={draft} projects={projects} />
        <p className={ink.hint}>{dueSummary(draft)}</p>
        <div className="flex flex-wrap justify-end gap-2">
          {item.due ? (
            <Button variant="ghost" className="mr-auto" onClick={() => save({ due: null })}>
              Clear due date
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!draft.ready} onClick={() => save(draft.body())}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
