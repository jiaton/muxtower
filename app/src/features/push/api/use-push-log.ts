import { useQuery } from '@tanstack/react-query'
import { readPushLog } from '@/lib/push-log'

/** This device's push log (`lib/push-log.ts`), read again every few seconds while shown. Local: no daemon. */
export function usePushLog() {
  return useQuery({ queryKey: ['local', 'push-log'], queryFn: readPushLog, refetchInterval: 5000 })
}
