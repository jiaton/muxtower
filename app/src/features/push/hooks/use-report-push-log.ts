import { useEffect } from 'react'
import { onResume } from '@/lib/resume'
import { postPushLog } from '../api/report-push-log'

/** Posts the service worker's push log (`lib/push-log.ts`) to the daemons: at start, whenever the app comes
 *  back, and when the worker says it logged something while a page is open. */
export function useReportPushLog() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const workers = navigator.serviceWorker
    const message = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'push-log') void postPushLog()
    }
    workers.addEventListener('message', message)
    void postPushLog()
    const stop = onResume(() => void postPushLog())
    return () => {
      stop()
      workers.removeEventListener('message', message)
    }
  }, [])
}
