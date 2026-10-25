import { Link, createFileRoute } from '@tanstack/react-router'
import { MessagesSquare, SquareTerminal } from 'lucide-react'
import { useState } from 'react'
import { QueryState } from '@/components/query-state'
import { Banner } from '@/components/ui/banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Pane } from '@/components/ui/pane'
import { Segmented } from '@/components/ui/segmented'
import { PendingActionCard } from '@/features/approval/components/pending-action-card'
import { useConversation } from '@/features/conversation/api/use-conversation'
import { ConversationView } from '@/features/conversation/components/conversation-view'
import { useSession } from '@/features/sessions/api/use-sessions'
import { SessionActionsMenu } from '@/features/sessions/components/session-actions-menu'
import { SessionHeader } from '@/features/sessions/components/session-header'
import { InputBar } from '@/features/terminal/components/input-bar'
import { TerminalMenuItems } from '@/features/terminal/components/terminal-menu-items'
import { TerminalView } from '@/features/terminal/components/terminal-view'
import { useSessionTerminal } from '@/features/terminal/hooks/use-session-terminal'
import { useTerminalPrefs } from '@/features/terminal/store'
import type { Session } from '@/lib/api/types'

export const Route = createFileRoute('/_sessions/d/$daemonId/s/$sessionId')({ component: SessionPage })

function SessionPage() {
  const { daemonId, sessionId } = Route.useParams()
  const query = useSession(daemonId, sessionId)
  return (
    <QueryState query={query}>
      {() =>
        query.session ? (
          // Keyed: another session starts from its own defaults (view, history depth, fit).
          <SessionView key={`${daemonId}/${sessionId}`} daemonId={daemonId} session={query.session} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState title="This session has ended">
              <Link to="/" search={true} className="text-accent underline">
                Back to sessions
              </Link>
            </EmptyState>
          </div>
        )
      }
    </QueryState>
  )
}

type View = 'terminal' | 'conversation'

/** Header; what the agent is waiting for, if anything; the terminal or the conversation (a session
 *  with both offers a switch); the input bar. */
function SessionView({ daemonId, session }: { daemonId: string; session: Session }) {
  const { screen, conversation: hasConversation } = session.capabilities
  const [view, setView] = useState<View>(screen ? 'terminal' : 'conversation')
  const terminal = useSessionTerminal(daemonId, session, view === 'terminal')
  const conversation = useConversation(daemonId, session.id, view === 'conversation' && hasConversation)
  const setFit = useTerminalPrefs((s) => s.setFit)

  return (
    <Pane className="flex-1" aria-label={session.name}>
      <SessionHeader
        session={session}
        actions={
          <>
            {screen && hasConversation ? (
              <Segmented
                aria-label="Show"
                value={view}
                onChange={setView}
                options={[
                  { value: 'terminal', label: <SquareTerminal aria-label="Terminal" className="size-4" /> },
                  { value: 'conversation', label: <MessagesSquare aria-label="Conversation" className="size-4" /> },
                ]}
              />
            ) : null}
            <SessionActionsMenu
              daemonId={daemonId}
              session={session}
              items={view === 'terminal' && screen ? <TerminalMenuItems sessionId={session.id} fit={terminal.fit} /> : undefined}
            />
          </>
        }
      />

      {session.needs_attention && session.pending ? (
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-border bg-surface p-3 sm:px-4">
          <PendingActionCard daemonId={daemonId} sessionId={session.id} pending={session.pending} />
        </div>
      ) : null}

      {view === 'terminal' ? (
        <>
          {terminal.error ? <Banner tone="error">{terminal.error.message}</Banner> : null}
          <TerminalView
            ansi={terminal.ansi}
            fontSize={terminal.fontSize}
            onNeedMore={terminal.loadMore}
            loadingMore={terminal.loadingMore}
            onFit={terminal.fit ? terminal.onFit : undefined}
            onFitRequest={() => setFit(session.id, true)}
          />
        </>
      ) : (
        <>
          {conversation.error ? <Banner tone="error">{conversation.error.message}</Banner> : null}
          <ConversationView items={conversation.data ?? []} />
        </>
      )}

      <footer className="shrink-0 border-t border-border bg-bg p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3">
        <InputBar daemonId={daemonId} sessionId={session.id} keys={view === 'terminal' ? session.capabilities.keys : ['Escape']} />
      </footer>
    </Pane>
  )
}
