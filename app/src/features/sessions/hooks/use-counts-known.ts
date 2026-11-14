import { useAllSessions } from '../api/use-sessions'

/** Whether every daemon's first list of sessions has come: before that, a count would say "0" for what
 *  is only not known yet, so counts are left out (or drawn as placeholders). */
export function useCountsKnown(): boolean {
  return !useAllSessions().some((d) => d.isPending)
}
