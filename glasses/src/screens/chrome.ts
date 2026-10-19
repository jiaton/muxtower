/** Header and footer pieces every screen shares. */
import type { AppState } from '@/state/model'
import type { ListWindow } from './list'

const LINK_LABELS = { connecting: 'connecting…', down: 'offline', rejected: 'unpaired', unpaired: 'unpaired' } as const

/** The connection, when it is not simply open. */
export const linkLabel = (state: AppState): string | null => (state.link === 'open' ? null : LINK_LABELS[state.link])

/** The notice if there is one, else what a tap does, plus the page when there is more than one. */
export function footerFor(state: AppState, list: ListWindow | null, tap: string): string {
  if (state.notice) return state.notice
  const page = list && list.pages > 1 ? `${list.page}/${list.pages} · ` : ''
  return `${page}tap ${tap} · 2× back`
}
