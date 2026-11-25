import { CalendarClock, FolderInput, MoreHorizontal, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/input'
import { ink, listItem } from '@/components/ui/intents'
import { ProjectTag } from '@/components/ui/project-hue'
import { DragHandle, sortLook, useSortableRow, type SortableRow } from '@/components/ui/sortable'
import type { InboxItem } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { dueLabel, type DueLabel } from '../model/due'
import { handedTo } from '../model/item'

/** A change the hub refused because the item changed elsewhere: what the owner meant to do, kept to offer
 *  again (never sent over the other change by itself). */
export interface Conflict {
  /** What it was, said in a few words ("the text", "done"). */
  what: string
}

export type InboxDialog = 'project' | 'due' | 'hand'

/** What a row can do and needs to know, from the list that holds it. */
export interface RowActions {
  done: (item: InboxItem, done: boolean) => void
  edit: (item: InboxItem, text: string) => void
  reopen: (item: InboxItem) => void
  remove: (item: InboxItem) => void
  open: (item: InboxItem, dialog: InboxDialog) => void
  hueOf: (project: string | null) => number | null
  sessionName: (id: string) => string | undefined
  conflictOf: (id: number) => Conflict | undefined
  retry: (item: InboxItem) => void
  dismiss: (item: InboxItem) => void
  /** The item to bring into view and mark (a tapped notification's). */
  focus?: number
}

const DUE_INK: Record<DueLabel['tone'], string> = { overdue: ink.noteWarning, today: ink.noteAccent, later: ink.meta }

/** Where it stands: its project, then its due date or its age; to whom it went and when; when it was done. */
function Status({ item, actions }: { item: InboxItem; actions: RowActions }) {
  const project = item.handed?.project ?? item.project
  const tag = project ? (
    <ProjectTag hue={actions.hueOf(project)} className="truncate">
      {project}
    </ProjectTag>
  ) : null
  if (item.status === 'done') return <span className={ink.meta}>Done · {ago(item.done_at)}</span>
  if (item.status === 'handed' && item.handed)
    return (
      <span className={cn('flex min-w-0 flex-wrap items-center gap-1', ink.meta)}>
        <Send aria-hidden className="size-3 shrink-0" />
        Handed to {handedTo(item, actions.sessionName)} in {tag} · {ago(item.handed.at)}
      </span>
    )
  const due = dueLabel(item)
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {tag}
      {due ? (
        <span className={cn('flex items-center gap-1', DUE_INK[due.tone])} data-due={due.tone}>
          <CalendarClock aria-hidden className="size-3 shrink-0" />
          {due.text}
        </span>
      ) : (
        <span className={cn(ink.meta, ink.count)}>{ago(item.created_at)}</span>
      )}
    </span>
  )
}

/** Its text, or the field it is edited in: Enter saves, Esc puts it back. */
function ItemText({ item, editing, stop, save }: { item: InboxItem; editing: boolean; stop: () => void; save: (text: string) => void }) {
  const [draft, setDraft] = useState(item.text)
  if (!editing) return <p className={cn('line-clamp-2 break-words', item.status === 'done' ? ink.quiet : ink.body)}>{item.text}</p>
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = draft.trim()
      if (text && text !== item.text) save(text)
      stop()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      stop()
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Textarea
        autoFocus
        rows={2}
        aria-label="Edit the item"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onFocus={(e) => e.currentTarget.setSelectionRange(draft.length, draft.length)}
        onBlur={stop}
      />
      <span className={ink.meta}>Enter saves · Esc cancels</span>
    </div>
  )
}

/** An item's "⋯": Edit, Set project, Due date, Hand to…, Open again (handed), Delete. */
function RowMenu({ item, actions, edit }: { item: InboxItem; actions: RowActions; edit: () => void }) {
  const done = item.status === 'done'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="More for this item" title="More">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem icon={Pencil} shortcut="e" onSelect={edit}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem icon={FolderInput} shortcut="p" onSelect={() => actions.open(item, 'project')}>
          {item.project ? 'Change project' : 'Set project'}
        </DropdownMenuItem>
        <DropdownMenuItem icon={CalendarClock} shortcut="d" disabled={done} onSelect={() => actions.open(item, 'due')}>
          {item.due ? 'Change due date' : 'Set due date'}
        </DropdownMenuItem>
        <DropdownMenuItem icon={Send} shortcut="h" disabled={done} onSelect={() => actions.open(item, 'hand')}>
          {item.status === 'handed' ? 'Hand to someone else…' : 'Hand to…'}
        </DropdownMenuItem>
        {item.status === 'handed' ? (
          <DropdownMenuItem icon={RotateCcw} shortcut="o" onSelect={() => actions.reopen(item)}>
            Back to open
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Trash2} shortcut="x" tone="danger" onSelect={() => actions.remove(item)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** It changed elsewhere: said plainly, with the item as it is now (shown in the row), and the owner's change
 *  offered again rather than sent over it. */
function ConflictNote({ item, conflict, actions }: { item: InboxItem; conflict: Conflict; actions: RowActions }) {
  return (
    <Banner tone="warning">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p>This changed elsewhere, so {conflict.what} was not saved. It shows as it is now.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => actions.retry(item)}>
            Apply mine again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => actions.dismiss(item)}>
            Keep it as it is
          </Button>
        </div>
      </div>
    </Banner>
  )
}

/** One item: its done box, its text (two lines at most), its project and where it stands, its "⋯"; with
 *  `sort`, put in order by its ⋮⋮ (a mouse, the keyboard) or held (a finger). */
export function InboxRow({ item, actions, sort }: { item: InboxItem; actions: RowActions; sort?: SortableRow }) {
  const [editing, setEditing] = useState(false)
  const done = item.status === 'done'
  const conflict = actions.conflictOf(item.id)
  const { ref: handleRef, ...handle } = sort?.handle ?? { ref: undefined }
  const focused = actions.focus === item.id
  const node = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    if (focused) node.current?.scrollIntoView?.({ block: 'center' })
  }, [focused])
  return (
    <li
      ref={(el) => {
        node.current = el
        sort?.ref(el)
      }}
      aria-current={focused || undefined}
      data-item={item.id}
      className={cn('group/sort relative', sortLook.hold, sort?.dragging && sortLook.from)}
      style={sort?.style}
      {...(sort && !editing ? sort.hold : {})}
    >
      <div className={cn('flex items-start gap-3 py-2 pr-2 pl-4 sm:pr-3 sm:pl-6', listItem({ dim: done, selected: focused }))}>
        {sort && !editing ? <DragHandle ref={handleRef} label={`Move “${item.text}”`} {...handle} /> : null}
        <div className="flex h-8 items-center">
          <Checkbox aria-label={done ? 'Not done' : 'Done'} checked={done} onChange={(e) => actions.done(item, e.target.checked)} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-1.5">
          <ItemText item={item} editing={editing} stop={() => setEditing(false)} save={(text) => actions.edit(item, text)} />
          <Status item={item} actions={actions} />
          {conflict ? <ConflictNote item={item} conflict={conflict} actions={actions} /> : null}
        </div>
        <RowMenu item={item} actions={actions} edit={() => setEditing(true)} />
      </div>
    </li>
  )
}

/** An open or handed item in the sortable list. */
export function SortableInboxRow({ item, actions }: { item: InboxItem; actions: RowActions }) {
  return <InboxRow item={item} actions={actions} sort={useSortableRow(item.id)} />
}
