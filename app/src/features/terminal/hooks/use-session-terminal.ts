import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@/lib/api/types'
import { useDaemonClient } from '@/lib/daemons/use-daemon-client'
import { daemonKey } from '@/lib/query'
import { HISTORY_STEPS, usePaneSize, useScreen } from '../api/use-terminal'
import { useTerminalPrefs } from '../store'

const MAX_ROWS = 300 // the daemon's limit
const SIZED_WAIT_MS = 1500 // a view that cannot be measured (hidden) reads the screen anyway

/** Screen, history depth and pane sizing for the session page. */
export function useSessionTerminal(daemonId: string, session: Session, enabled: boolean) {
  const client = useDaemonClient(daemonId)
  const fontSize = useTerminalPrefs((s) => s.fontSize)
  const screens = useTerminalPrefs((s) => s.screens)
  const fitPref = useTerminalPrefs((s) => s.fit[session.id])
  // By default, fit what nobody else may be watching: what muxtower started, or a pane no terminal is
  // attached to. A pane someone has open at their own size keeps it until fitting is asked for.
  const fit = enabled && (fitPref ?? (session.source === 'launched' || !session.terminal_attached))
  const [history, setHistory] = useState<number>(HISTORY_STEPS[0])
  const [waitingOn, setWaitingOn] = useState<string | undefined>(undefined)
  // Fitting, the screen is read once the pane has this view's size: read first, it shows the agent as
  // last drawn for another size (tmux's narrow default, when nobody was watching).
  const [sized, setSized] = useState(false)
  const ready = !fit || sized
  const screen = useScreen(daemonId, session.id, history, enabled && ready)
  const paneSize = usePaneSize(daemonId, session.id)
  const queryClient = useQueryClient()
  const mutate = useRef(paneSize.mutate)
  mutate.current = paneSize.mutate

  useEffect(() => {
    if (!fit || sized) return
    const timer = setTimeout(() => setSized(true), SIZED_WAIT_MS)
    return () => clearTimeout(timer)
  }, [fit, sized])

  const lineCount = screen.data ? screen.data.split('\n').length : 0
  const next = HISTORY_STEPS.find((step) => step > history)
  const canLoadMore = next !== undefined && lineCount >= history
  const loadingMore = waitingOn !== undefined && screen.data === waitingOn

  const loadMore = useCallback(() => {
    if (!canLoadMore || next === undefined) return
    setWaitingOn(screen.data)
    setHistory(next)
  }, [canLoadMore, next, screen.data])

  // As wide as the view and `screens` views tall: the view scrolls through the rest.
  const onFit = useCallback(
    (size: { cols: number; rows: number }) =>
      mutate.current(
        { cols: size.cols, rows: Math.min(MAX_ROWS, size.rows * screens) },
        {
          onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: daemonKey(daemonId, 'screen', session.id) })
            setSized(true)
          },
        },
      ),
    [screens, queryClient, daemonId, session.id],
  )

  // While fitting, the pane is sized for this screen; give the size back when fitting stops, the page
  // is left, or the tab closes (keepalive request, since the page is going away).
  useEffect(() => {
    if (!fit || !client) return
    const release = () =>
      void client
        .POST('/v1/sessions/{session_id}/resize/release', {
          params: { path: { session_id: session.id } },
          keepalive: true,
        })
        .catch(() => undefined)
    window.addEventListener('pagehide', release)
    return () => {
      window.removeEventListener('pagehide', release)
      mutate.current(null)
    }
  }, [fit, client, session.id])

  return {
    ansi: ready ? screen.data : undefined, // not a screen kept from another size meanwhile
    error: screen.error,
    fontSize,
    fit,
    onFit,
    loadMore,
    loadingMore,
  }
}
