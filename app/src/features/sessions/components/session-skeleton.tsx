import { FooterBar, composerColumns } from '@/components/ui/bar'
import { Pane, PaneHeader } from '@/components/ui/pane'
import { Skeleton } from '@/components/ui/skeleton'

/** A session page while its session loads, in the page's own layout (the header with its name and state,
 *  the view, the message box in its place), so nothing moves when it comes. */
export function SessionSkeleton() {
  return (
    <Pane className="flex-1" aria-label="Loading the session">
      <PaneHeader
        title={
          <>
            <Skeleton shape="title" className="w-40 max-w-[50%]" />
            <Skeleton shape="badge" />
          </>
        }
        subtitle={<Skeleton className="w-72 max-w-full" />}
      />
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 p-4">
        <Skeleton className="w-3/4" />
        <Skeleton className="w-1/2" />
        <Skeleton className="w-2/3" />
      </div>
      <FooterBar>
        <div className={`flex items-end ${composerColumns.gap}`}>
          <span className={`${composerColumns.lead} h-10`}>
            <Skeleton shape="icon" />
          </span>
          <Skeleton shape="control" className="min-w-0 flex-1" />
          <Skeleton shape="control" className="w-10 shrink-0" />
        </div>
      </FooterBar>
    </Pane>
  )
}
