import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@/lib/api/types";
import { useDaemonClient } from "@/lib/daemons/use-daemon-client";
import { HISTORY_STEPS, usePaneSize, useScreen } from "../api/use-terminal";
import { useTerminalPrefs } from "../store";

/** Screen, history depth and pane sizing for the session page. */
export function useSessionTerminal(
  daemonId: string,
  session: Session,
  enabled: boolean,
) {
  const client = useDaemonClient(daemonId);
  const fontSize = useTerminalPrefs((s) => s.fontSize);
  const fitPref = useTerminalPrefs((s) => s.fit[session.id]);
  const fit = enabled && (fitPref ?? session.source === "launched");
  const [history, setHistory] = useState<number>(HISTORY_STEPS[0]);
  const [waitingOn, setWaitingOn] = useState<string | undefined>(undefined);
  const screen = useScreen(daemonId, session.id, history, enabled);
  const paneSize = usePaneSize(daemonId, session.id);
  const mutate = useRef(paneSize.mutate);
  mutate.current = paneSize.mutate;

  const lineCount = screen.data ? screen.data.split("\n").length : 0;
  const next = HISTORY_STEPS.find((step) => step > history);
  const canLoadMore = next !== undefined && lineCount >= history;
  const loadingMore = waitingOn !== undefined && screen.data === waitingOn;

  const loadMore = useCallback(() => {
    if (!canLoadMore || next === undefined) return;
    setWaitingOn(screen.data);
    setHistory(next);
  }, [canLoadMore, next, screen.data]);

  const onFit = useCallback(
    (size: { cols: number; rows: number }) => mutate.current(size),
    [],
  );

  // While fitting, the pane is sized for this screen; give the size back when fitting stops, the page
  // is left, or the tab closes (keepalive request, since the page is going away).
  useEffect(() => {
    if (!fit || !client) return;
    const release = () =>
      void client
        .POST("/v1/sessions/{session_id}/resize/release", {
          params: { path: { session_id: session.id } },
          keepalive: true,
        })
        .catch(() => undefined);
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      mutate.current(null);
    };
  }, [fit, client, session.id]);

  return {
    ansi: screen.data,
    error: screen.error,
    fontSize,
    fit,
    onFit,
    loadMore,
    loadingMore,
  };
}
