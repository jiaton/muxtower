import { useMemo } from 'react'
import { createDaemonClient, type DaemonClient } from '@/lib/api/client'
import { useDaemon } from './store'

/** The typed API client for one daemon, or null if it is unknown, not paired, or its token was rejected
 *  (queries using it are then disabled instead of repeating 401s). */
export function useDaemonClient(daemonId: string): DaemonClient | null {
  const daemon = useDaemon(daemonId)
  const url = daemon?.url
  const token = daemon?.rejected ? null : (daemon?.token ?? null)
  return useMemo(() => (url && token ? createDaemonClient({ url, token }) : null), [url, token])
}
