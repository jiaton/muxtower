import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Power } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { QueryState } from '@/components/query-state'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { PendingActionCard } from '@/features/approval/components/pending-action-card'
import { useTerminateSession, useUpdateSession } from '@/features/sessions/api/use-session-mutations'
import { useSession } from '@/features/sessions/api/use-sessions'
import { StateBadge } from '@/features/sessions/components/state-badge'
import { HISTORY_STEPS, usePaneSize, useScreen } from '@/features/terminal/api/use-terminal'
import { InputBar } from '@/features/terminal/components/input-bar'
import { TerminalToolbar } from '@/features/terminal/components/terminal-toolbar'
import { TerminalView } from '@/features/terminal/components/terminal-view'
import { useTerminalPrefs } from '@/features/terminal/store'
import { ConversationView } from '@/features/conversation/components/conversation-view'
import { useConversation } from '@/features/conversation/api/use-conversation'
import { useDaemon } from '@/lib/daemons/store'
import type { Session } from '@/lib/api/types'

export const Route = createFileRoute('/d/$daemonId/s/$sessionId')({ component: SessionPage })

function SessionPage() {
  const { daemonId, sessionId } = Route.useParams()
  const query = useSession(daemonId, sessionId)
  return (
    <QueryState query={query}>
      {() =>
        query.session ? (
          <SessionView daemonId={daemonId} session={query.session} />
        ) : (
          <EmptyState title="This session has ended">
            <Link to="/" className="text-accent underline">
              Back to the inbox
            </Link>
          </EmptyState>
        )
      }
    </QueryState>
  )
}

function SessionView({ daemonId, session }: { daemonId: string; session: Session }) {
  const conversational = session.capabilities.conversation && !session.capabilities.screen
  const terminal = useTerminal(daemonId, session, !conversational)
  const conversation = useConversation(daemonId, session.id, conversational)
  const update = useUpdateSession(daemonId, session.id)
  const terminate = useTerminateSession(daemonId, session.id)
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(session.name)
  const renamable = session.source !== 'remote_control'

  return (
    <div className="-mx-4 -mt-4 flex flex-1 flex-col gap-3 px-3 pt-3">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to inbox">
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="min-w-0 truncate text-lg font-semibold">{session.name}</h1>
        <StateBadge state={session.state} />
        <div className="ml-auto flex items-center gap-1">
          {renamable ? (
            <Button variant="ghost" size="icon-sm" aria-label="Rename" onClick={() => setRenaming(true)}>
              <Pencil />
            </Button>
          ) : null}
          {session.capabilities.terminate ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Stop session"
              onClick={() => {
                if (confirm(`Stop ${session.name}? This kills its tmux session.`))
                  terminate.mutate(undefined, { onSuccess: () => void navigate({ to: '/' }) })
              }}
            >
              <Power />
            </Button>
          ) : null}
        </div>
      </header>

      {session.can_auto_approve ? (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-fg-muted">Auto-approve tool permissions and trust prompts</span>
          <Switch checked={session.auto_approve} onCheckedChange={(on) => update.mutate({ auto_approve: on })} />
        </label>
      ) : null}

      {session.needs_attention && session.pending ? (
        <div className="rounded-lg border border-state-permission bg-surface p-3">
          <PendingActionCard daemonId={daemonId} sessionId={session.id} pending={session.pending} />
        </div>
      ) : null}

      {session.machine || session.origin ? (
        <p className="text-xs text-fg-muted">
          {[session.machine && `@${session.machine}`, session.origin && `started from ${session.origin.replace('_', ' ')}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
      {conversational ? (
        <>
          {conversation.error ? <Banner tone="error">{conversation.error.message}</Banner> : null}
          <ConversationView items={conversation.data ?? []} />
        </>
      ) : (
        <>
          <TerminalToolbar sessionId={session.id} fit={terminal.fit} />
          {terminal.error ? <Banner tone="error">{terminal.error.message}</Banner> : null}
          <TerminalView
            ansi={terminal.ansi}
            fontSize={terminal.fontSize}
            onNeedMore={terminal.loadMore}
            loadingMore={terminal.loadingMore}
            onFit={terminal.fit ? terminal.onFit : undefined}
          />
        </>
      )}
      <InputBar daemonId={daemonId} sessionId={session.id} keys={session.capabilities.keys} />

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent title="Rename session">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              update.mutate({ name: name.trim() }, { onSuccess: () => setRenaming(false) })
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required aria-label="Session name" />
            <Button type="submit" disabled={update.isPending}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Screen, history depth and pane sizing for the session page. */
function useTerminal(daemonId: string, session: Session, enabled: boolean) {
  const daemon = useDaemon(daemonId)
  const fontSize = useTerminalPrefs((s) => s.fontSize)
  const fitPref = useTerminalPrefs((s) => s.fit[session.id])
  const fit = enabled && (fitPref ?? session.source === 'launched')
  const [history, setHistory] = useState<number>(HISTORY_STEPS[0])
  const [waitingOn, setWaitingOn] = useState<string | undefined>(undefined)
  const screen = useScreen(daemonId, session.id, history, enabled)
  const paneSize = usePaneSize(daemonId, session.id)
  const mutate = useRef(paneSize.mutate)
  mutate.current = paneSize.mutate

  const lineCount = screen.data ? screen.data.split('\n').length : 0
  const next = HISTORY_STEPS.find((step) => step > history)
  const canLoadMore = next !== undefined && lineCount >= history
  const loadingMore = waitingOn !== undefined && screen.data === waitingOn

  const loadMore = useCallback(() => {
    if (!canLoadMore || next === undefined) return
    setWaitingOn(screen.data)
    setHistory(next)
  }, [canLoadMore, next, screen.data])

  const onFit = useCallback((size: { cols: number; rows: number }) => mutate.current(size), [])

  // While fitting, the pane is sized for this screen; give the size back when fitting stops, the page
  // is left, or the tab closes (keepalive request, since the page is going away).
  useEffect(() => {
    if (!fit || !daemon?.token) return
    const release = () =>
      void fetch(`${daemon.url}/v1/sessions/${encodeURIComponent(session.id)}/resize/release`, {
        method: 'POST',
        keepalive: true,
        headers: { Authorization: `Bearer ${daemon.token}` },
      }).catch(() => undefined)
    window.addEventListener('pagehide', release)
    return () => {
      window.removeEventListener('pagehide', release)
      mutate.current(null)
    }
  }, [fit, daemon?.url, daemon?.token, session.id])

  return { ansi: screen.data, error: screen.error, fontSize, fit, onFit, loadMore, loadingMore }
}
