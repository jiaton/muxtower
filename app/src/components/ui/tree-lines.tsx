import { cn } from '@/lib/cn'

/** A fork tree's metrics: a level's indent, and where its rail and joins fall on a row (under the rows'
 *  state icons). */
export const TREE_INDENT_REM = 1.25
const RAIL_REM = 1.3 // a level's rail, from its rows' left edge: under their state icons' centres
const ICON_MID_REM = 1.25 // a row's state icon's centre, from the row's top
const ICON_BELOW_REM = 1.75 // just under it
const LINE = 'pointer-events-none absolute z-10 border-fg-muted/60' // over the row, whose swipe layer paints a ground

const railX = (level: number) => `calc(${level * TREE_INDENT_REM}rem + ${RAIL_REM}rem)`

/** The tree's lines on a row (file-tree style): at each level above it, the rail of an ancestor that has
 *  more forks below (`rails`); its own join to its parent's rail (├, or └ when it is the last); and, when
 *  its forks show, its own rail from under its state icon down to its first fork's join. */
export function TreeLines({ depth, rails, last, open }: { depth: number; rails: boolean[]; last: boolean; open: boolean }) {
  return (
    <>
      {rails.map((on, level) =>
        on ? <span key={level} aria-hidden className={cn(LINE, 'top-0 bottom-0 border-l')} style={{ left: railX(level) }} /> : null,
      )}
      {depth ? (
        <>
          <span
            aria-hidden
            data-join={last ? 'last' : 'more'}
            className={cn(LINE, 'top-0 w-2.5 border-b border-l', last && 'rounded-bl-md')}
            style={{ left: railX(depth - 1), height: `${ICON_MID_REM}rem` }}
          />
          {last ? null : (
            <span aria-hidden className={cn(LINE, 'bottom-0 border-l')} style={{ left: railX(depth - 1), top: `${ICON_MID_REM}rem` }} />
          )}
        </>
      ) : null}
      {open ? (
        <span
          aria-hidden
          data-rail="forks"
          className={cn(LINE, 'bottom-0 border-l')}
          style={{ left: railX(depth), top: `${ICON_BELOW_REM}rem` }}
        />
      ) : null}
    </>
  )
}
