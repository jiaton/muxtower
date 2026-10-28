import { Link, createFileRoute } from '@tanstack/react-router'
import { History, MessagesSquare, Reply, SquareTerminal, Unplug } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { QueryState } from '@/components/query-state'
import { Banner } from '@/components/ui/banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Pane } from '@/components/ui/pane'
import { Pager } from '@/components/ui/pager'
import { Segmented } from '@/components/ui/segmented'
import { SelectionAction } from '@/components/ui/selection-action'
import { PendingActionCard } from '@/features/approval/components/pending-action-card'
import { useConversation } from '@/features/conversation/api/use-conversation'
import { useDaemonMe } from '@/features/daemons/api/use-daemon-me'
import { ConversationView } from '@/features/conversation/components/conversation-view'
import { useSession } from '@/features/sessions/api/use-sessions'
import { SessionActionsMenu } from '@/features/sessions/components/session-actions-menu'
import { SessionHeader } from '@/features/sessions/components/session-header'
import { useSeenWhileOpen } from '@/features/sessions/hooks/use-seen-while-open'
import { useSessionDrawer } from '@/features/sessions/store'
import { useSendInput } from '@/features/terminal/api/use-terminal'
import { InputBar } from '@/features/terminal/components/input-bar'
import { TerminalMenuItems } from '@/features/terminal/components/terminal-menu-items'
import { TerminalView } from '@/features/terminal/components/terminal-view'
import { useSessionTerminal } from '@/features/terminal/hooks/use-session-terminal'
import { draftKey, useDrafts, useTerminalPrefs } from '@/features/terminal/store'
import { MicButton } from '@/features/voice/components/mic-button'
import { VoiceBar } from '@/features/voice/components/voice-bar'
import { useDictation } from '@/features/voice/hooks/use-dictation'
import type { Session } from '@/lib/api/types'
import { useOutgoing } from '@/lib/use-outbox'

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

/** Header; what the agent is waiting for, if anything; the terminal or the conversation (a session with
 *  both offers a switch, and a swipe between them); the input bar. Swiping right past the first view opens
 *  the list (a drawer on phones). An archived session is its conversation only; one whose node is offline
 *  says so, read only. */
function SessionView({ daemonId, session }: { daemonId: string; session: Session }) {
  const { screen, conversation: hasConversation } = session.capabilities
  const [view, setView] = useState<View>(screen ? 'terminal' : 'conversation')
  // Both stay live while the session is open, so a swipe between them shows each as it is now (and the
  // pane keeps its fit, instead of being given back and fitted again).
  const terminal = useSessionTerminal(daemonId, session, screen)
  const conversation = useConversation(daemonId, session.id, hasConversation)
  // What was sent and is not in the conversation yet, shown at its end.
  const outgoing = useOutgoing(daemonId, session.id, hasConversation ? conversation.data : undefined)
  const setFit = useTerminalPrefs((s) => s.setFit)
  const setDrawer = useSessionDrawer((s) => s.setOpen)
  const openDrawer = useCallback(() => setDrawer(true), [setDrawer])
  const both = screen && hasConversation
  useSeenWhileOpen(daemonId, session)
  const views = useRef<HTMLDivElement>(null)
  const addQuote = useDrafts((s) => s.addQuote)
  const setDraft = useDrafts((s) => s.setDraft)
  // Spoken words go into the message box after what is typed, to read before sending.
  const dictation = useDictation(daemonId, !!useDaemonMe(daemonId).data?.features.asr, (said) => {
    const key = draftKey(daemonId, session.id)
    const typed = useDrafts.getState().drafts[key]?.trimEnd()
    setDraft(key, typed ? `${typed} ${said}` : said)
  })
  const writable = !session.archived_at && !session.offline
  const send = useSendInput(daemonId, session.id)
  // A reply the agent offered (its next step), sent like one typed: shown on its way, gone if it fails.
  const reply = (text: string) => {
    const tracked = outgoing.track?.(text)
    send.mutate({ text, enter: true }, { onSuccess: tracked?.sent, onError: tracked?.failed })
  }

  return (
    <Pane className="flex-1" aria-label={session.name}>
      <SessionHeader
        daemonId={daemonId}
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

      {session.offline ? (
        <div className="flex-1 p-4">
          <EmptyState icon={<Unplug />} title={`${session.node ?? 'Its computer'} is offline`}>
            This is how it was when it was last connected. It comes back here, live, when that computer is on again.
          </EmptyState>
        </div>
      ) : null}

      <div ref={views} className="contents">
        <Pager
          className={session.offline ? 'hidden' : 'flex-1'}
          label="Session views"
          index={both && view === 'conversation' ? 1 : 0}
          onIndexChange={(page) => both && setView(page === 1 ? 'conversation' : 'terminal')}
          onPastStart={openDrawer}
        >
          {screen ? (
            <>
              {terminal.error ? <Banner tone="error">{terminal.error.message}</Banner> : null}
              {session.alt_screen && hasConversation ? (
                // A full-screen agent (Claude Code's fullscreen TUI) leaves tmux no scrollback to scroll.
                <button
                  type="button"
                  onClick={() => setView('conversation')}
                  className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-muted px-3 py-1.5 text-left text-xs text-fg-muted hover:text-fg sm:px-4"
                >
                  <History className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">Full-screen app: earlier output is in the conversation</span>
                  <span className="shrink-0 font-medium text-accent">Show</span>
                </button>
              ) : null}
              <TerminalView
                ansi={terminal.ansi}
                fontSize={terminal.fontSize}
                onNeedMore={terminal.loadMore}
                loadingMore={terminal.loadingMore}
                onFit={terminal.fit ? terminal.onFit : undefined}
                onFitRequest={() => setFit(session.id, true)}
              />
            </>
          ) : null}
          {hasConversation ? (
            <>
              {conversation.error ? <Banner tone="error">{conversation.error.message}</Banner> : null}
              <ConversationView
                items={conversation.data ?? []}
                pending={outgoing.pending}
                onDismiss={outgoing.dismiss}
                onReply={writable ? reply : undefined}
              />
            </>
          ) : null}
        </Pager>
      </div>

      {writable ? (
        <>
          {/* Select what the agent wrote, then Reply: it waits above the message box as a quote. */}
          <SelectionAction within={views} label="Reply" icon={Reply} onAction={(text) => addQuote(draftKey(daemonId, session.id), text)} />
          <footer className="shrink-0 border-t border-border bg-bg p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3">
            {dictation.error ? <Banner tone="error">{dictation.error}</Banner> : null}
            <InputBar
              daemonId={daemonId}
              sessionId={session.id}
              keys={session.capabilities.keys}
              images={session.capabilities.images}
              track={outgoing.track}
              extra={dictation.available ? <MicButton dictation={dictation} /> : null}
              cover={dictation.active ? <VoiceBar dictation={dictation} /> : null}
            />
          </footer>
        </>
      ) : null}
    </Pane>
  )
}
