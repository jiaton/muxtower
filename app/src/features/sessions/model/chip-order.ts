/** Reordering the owner's chip groups by dragging (or Alt+←/→): pure, so the row only measures and draws. */

/** `ids` with `id` moved to position `to` (of the list without it). */
export function movedTo(ids: string[], id: string, to: number): string[] {
  const rest = ids.filter((x) => x !== id)
  const at = Math.max(0, Math.min(rest.length, to))
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

/** Where a chip dragged to `x` lands: how many of the other chips' centres lie before it. */
export function slotAt(centres: number[], x: number): number {
  return centres.filter((c) => c < x).length
}

/** One step left or right (a key), or null at the end. */
export function stepped(ids: string[], id: string, by: -1 | 1): string[] | null {
  const at = ids.indexOf(id)
  const to = at + by
  if (at < 0 || to < 0 || to >= ids.length) return null
  return movedTo(ids, id, to)
}
