import { listRow } from '@/components/ui/list-row'
import { listItem } from '@/components/ui/intents'
import { Skeleton } from '@/components/ui/skeleton'

const WIDTHS = ['w-2/3', 'w-1/2', 'w-3/4', 'w-2/5', 'w-3/5', 'w-1/2'] // names of different lengths

/** The session list before its first sessions come: rows in a row's shape (its state, its name and the
 *  line under it, its time), inside the list's own chrome. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {WIDTHS.slice(0, rows).map((width, i) => (
        <div key={i} className={`${listItem({})} ${listRow()}`}>
          <span className="pt-0.5">
            <Skeleton shape="icon" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton shape="title" className={width} />
            <Skeleton className="w-4/5" />
          </div>
          <Skeleton className="w-8 shrink-0" />
        </div>
      ))}
    </div>
  )
}
