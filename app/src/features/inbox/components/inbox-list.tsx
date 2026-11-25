import { DndContext, DragOverlay, defaultDropAnimation, type Announcements, type DragEndEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Inbox } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ink, look } from '@/components/ui/intents'
import { Loading } from '@/components/ui/skeleton'
import { sortLook, useReducedMotion, useSortSensors } from '@/components/ui/sortable'
import type { InboxItem } from '@/lib/api/types'
import { keysOf } from '@/lib/shortcuts'
import { useDoneItems } from '../api/use-inbox'
import { splitDue } from '../model/due'
import { InboxRow, SortableInboxRow, type RowActions } from './inbox-row'

/** The whole order with `rest` (the items outside "Due soon") put as given, each in one of the places the
 *  rest held: the items due soon keep theirs. */
export function orderWith(all: readonly InboxItem[], rest: readonly number[]): number[] {
  const queue = [...rest]
  return all.map((i) => (rest.includes(i.id) ? queue.shift()! : i.id))
}

/** "Show done (last 30 days)": the done items, read only once shown. */
function DoneItems({ actions }: { actions: RowActions }) {
  const [shown, setShown] = useState(false)
  const done = useDoneItems(shown)
  return (
    <div className="flex flex-col gap-1 px-2 pb-4 sm:px-3">
      <Button variant="ghost" size="sm" className="self-start" aria-expanded={shown} onClick={() => setShown((v) => !v)}>
        {shown ? 'Hide done' : 'Show done (last 30 days)'}
      </Button>
      {shown ? (
        done.isPending ? (
          <Loading />
        ) : done.data?.length ? (
          <ul aria-label="Done" className="flex flex-col">
            {done.data.map((item) => (
              <InboxRow key={item.id} item={item} actions={actions} />
            ))}
          </ul>
        ) : (
          <p className={`${ink.meta} px-2`}>Nothing done in the last 30 days.</p>
        )
      ) : null}
    </div>
  )
}

/**
 * The Inbox: "Due soon" first (due or overdue, then the next 7 days, by date), then the rest in the owner's
 * order, put in order by hand (dnd-kit's sortable, one axis, as the list's projects: a handle for a mouse and
 * the keyboard, a held finger on a touch screen); then "Show done (last 30 days)".
 */
export function InboxList({ items, actions, onReorder }: { items: InboxItem[]; actions: RowActions; onReorder: (ids: number[]) => void }) {
  const sensors = useSortSensors()
  const still = useReducedMotion()
  const [lifted, setLifted] = useState<number | null>(null)
  const { soon, rest } = splitDue(items)
  const ids = rest.map((i) => i.id)
  const textOf = (id: UniqueIdentifier) => rest.find((i) => i.id === id)?.text ?? ''
  const at = (id: UniqueIdentifier) => ids.indexOf(Number(id)) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up “${textOf(active.id)}”, item ${at(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) => (over && over.id !== active.id ? `Moved to place ${at(over.id)} of ${ids.length}.` : undefined),
    onDragEnd: ({ over }) => (over ? `Put at place ${at(over.id)} of ${ids.length}.` : 'Put back.'),
    onDragCancel: () => 'Put back where it was.',
  }
  if (!items.length)
    return (
      <div className="flex flex-col gap-3">
        <div className="p-4">
          <EmptyState icon={<Inbox />} title="Nothing in your Inbox">
            Press <kbd className={look.keycap}>{keysOf('quickAdd')}</kbd> anywhere to jot something down.
          </EmptyState>
        </div>
        <DoneItems actions={actions} />
      </div>
    )
  return (
    <div className="flex flex-col gap-3">
      {soon.length ? (
        <section aria-label="Due soon" className="flex flex-col">
          <h2 className={`${ink.eyebrow} px-4 pt-3 sm:px-6`}>Due soon</h2>
          <ul className="flex flex-col">
            {soon.map((item) => (
              <InboxRow key={item.id} item={item} actions={actions} />
            ))}
          </ul>
        </section>
      ) : null}
      {rest.length ? (
        <section aria-label="Items" className="flex flex-col">
          {soon.length ? <h2 className={`${ink.eyebrow} px-4 pt-3 sm:px-6`}>Later</h2> : null}
          <DndContext
            sensors={sensors}
            modifiers={[restrictToVerticalAxis]}
            autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 10 }}
            accessibility={{
              announcements,
              screenReaderInstructions: {
                draggable:
                  'To move an item, press Space, then the up and down arrows, then Space to put it down, or Escape to put it back.',
              },
            }}
            onDragStart={(e) => {
              setLifted(Number(e.active.id))
              if (typeof window.TouchEvent !== 'undefined' && e.activatorEvent instanceof window.TouchEvent) navigator.vibrate?.(10)
            }}
            onDragCancel={() => setLifted(null)}
            onDragEnd={(e: DragEndEvent) => {
              setLifted(null)
              if (!e.over || e.active.id === e.over.id) return
              const moved = arrayMove(ids, ids.indexOf(Number(e.active.id)), ids.indexOf(Number(e.over.id)))
              onReorder(orderWith(items, moved))
            }}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col">
                {rest.map((item) => (
                  <SortableInboxRow key={item.id} item={item} actions={actions} />
                ))}
              </ul>
            </SortableContext>
            <DragOverlay dropAnimation={still ? null : defaultDropAnimation}>
              {lifted !== null ? (
                <ul className={`${sortLook.lifted} ${look.surface}`}>
                  {rest
                    .filter((i) => i.id === lifted)
                    .map((item) => (
                      <InboxRow key={item.id} item={item} actions={actions} />
                    ))}
                </ul>
              ) : null}
            </DragOverlay>
          </DndContext>
        </section>
      ) : null}
      <DoneItems actions={actions} />
    </div>
  )
}
