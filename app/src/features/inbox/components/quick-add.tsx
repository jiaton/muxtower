import { CalendarClock, X } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ink, look } from '@/components/ui/intents'
import { Label, LabelNote } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { keysOf } from '@/lib/shortcuts'
import { useShortcut } from '@/lib/use-shortcut'
import { reasonOf, useAddInboxItem } from '../api/use-inbox'
import type { InboxProject } from '../model/item'
import { useQuickAdd } from '../store'
import { DueEditor, draftSummary, useDueDraft } from './due-editor'

/** The quick-add box: a line for the item and, if it is for one, a project and a due date. Enter adds it. */
export function QuickAddForm({ projects, onDone }: { projects: InboxProject[]; onDone: () => void }) {
  const [text, setText] = useState('')
  const [project, setProject] = useState('')
  const [withDue, setWithDue] = useState(false)
  const due = useDueDraft()
  const add = useAddInboxItem()
  const ready = Boolean(text.trim()) && (!withDue || !due.day || due.ready)
  const submit = () => {
    if (!ready) return
    add.mutate({ text: text.trim(), project: project || null, ...(withDue ? due.body() : {}) }, { onSuccess: onDone })
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Input
        autoFocus
        aria-label="What to add"
        placeholder="An idea or a to-do, for any project…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Label>
        <span>
          Project <LabelNote>optional</LabelNote>
        </span>
        <Select value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </Select>
      </Label>
      {withDue ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className={ink.label}>Due date</span>
            <Button variant="ghost" size="sm" onClick={() => setWithDue(false)}>
              <X aria-hidden /> No due date
            </Button>
          </div>
          <DueEditor draft={due} projects={projects} />
          <p className={ink.hint}>{draftSummary(due)}</p>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setWithDue(true)}>
          <CalendarClock aria-hidden /> Add a due date
        </Button>
      )}
      {add.isError ? <Banner tone="error">{reasonOf(add.error)}</Banner> : null}
      <div className="flex items-center justify-between gap-2">
        <span className={ink.meta}>
          <kbd className={look.keycap}>{keysOf('quickAdd')}</kbd> from anywhere
        </span>
        <Button type="submit" disabled={!ready || add.isPending}>
          Add to Inbox
        </Button>
      </div>
    </form>
  )
}

/** The quick-add box as a dialog, mounted once with the app's shell: Alt+N anywhere (also while typing in the
 *  message box) or the Inbox's + opens it. */
export function QuickAddHost({ projects }: { projects: InboxProject[] }) {
  const { open, setOpen } = useQuickAdd()
  useShortcut('quickAdd', () => setOpen(true))
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? (
        <DialogContent title="Add to Inbox">
          <QuickAddForm projects={projects} onDone={() => setOpen(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
