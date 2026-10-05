import { useMemo } from 'react'
import { createDaemonClient, type DaemonClient } from '@/lib/api/client'
import { useDaemonsStore } from '../store'

export function useDaemonClient(daemonId: string): DaemonClient | null {
  const daemon = useDaemonsStore((s) => s.daemons.find((d) => d.id === daemonId))
  const url = daemon?.url
  const token = daemon?.token ?? null
  return useMemo(() => (url ? createDaemonClient({ url, token }) : null), [url, token])
}
