import { useMemo } from 'react'
import { StatusDot } from '@/components/ui/status-dot'
import type { TokenRow, TokenSource } from '@/components/ui/token-menu'
import type { Session } from '@/lib/api/types'
import { handleOf, mentionAt, mentionOf, recentMentions, rememberMention, rowsFor } from '../model/mention'
import { text, textRole } from '@/components/ui/styles'

const tone = (s: Session) => (s.needs_attention ? 'warn' : s.state === 'busy' ? 'ok' : s.state === 'error' ? 'error' : ('idle' as const))

const stateText = (s: Session) => (s.needs_attention ? 'needs you' : s.state === 'busy' ? 'working' : s.state)

function sessionRow(s: Session): TokenRow {
  const handle = handleOf(s)
  const more = [handle !== s.name ? s.name : null, s.project, s.machine].filter(Boolean).join(' · ')
  return {
    key: s.id,
    text: mentionOf(s),
    label: (
      <>
        <StatusDot tone={tone(s)} label={stateText(s)} />
        <span className={`${text({ weight: 'medium' })} shrink-0`}>{handle}</span>
        <span className={`${textRole.meta} min-w-0 truncate`}>{more}</span>
      </>
    ),
  }
}

/** What `@` offers in `current`'s message box on `daemonId`: its team, the sessions mentioned lately on
 *  this browser, the other projects folded (`rowsFor`); with a query, the matches across every project.
 *  For `InputBar`'s `mention` slot; undefined until the sessions are there. */
export function useMentionSource(daemonId: string, current: Session | undefined, sessions: Session[] | undefined) {
  return useMemo<TokenSource | undefined>(() => {
    if (!current || !sessions) return undefined
    return {
      label: 'Mention a session',
      at: mentionAt,
      rows: (query, open) =>
        rowsFor(sessions, current, query, recentMentions(daemonId), open).map((row) =>
          row.kind === 'session'
            ? sessionRow(row.session)
            : {
                key: `project:${row.project}`,
                group: row.project,
                label: (
                  <span className="truncate">
                    {row.project}{' '}
                    <span className={text({ tone: 'muted' })}>
                      · {row.count} session{row.count === 1 ? '' : 's'}
                    </span>
                  </span>
                ),
              },
        ),
      picked: (row) => rememberMention(daemonId, row.key),
    }
  }, [daemonId, current, sessions])
}
