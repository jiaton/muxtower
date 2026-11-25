import { listItem } from '@/components/ui/intents'
import { Skeleton } from '@/components/ui/skeleton'

const WIDTHS = ['w-2/3', 'w-1/2', 'w-3/4', 'w-2/5', 'w-3/5']

/** The Inbox before its items come: rows in an item's shape (its box, its text, the line under it). */
export function ListSkeleton() {
  return (
    <div aria-hidden>
      {WIDTHS.map((width, i) => (
        <div key={i} className={`${listItem({})} flex items-start gap-3 py-3 pr-2 pl-4 sm:pr-3 sm:pl-6`}>
          <Skeleton shape="icon" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton shape="title" className={width} />
            <Skeleton className="w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
