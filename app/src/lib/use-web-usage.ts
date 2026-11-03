import { useEffect, useState } from 'react'
import { snapshot, type WebUsage } from './diagnostics'

/** This page's own usage (`diagnostics.ts`), read again every few seconds. */
export function useWebUsage(everyMs = 5000): WebUsage {
  const [usage, setUsage] = useState(snapshot)
  useEffect(() => {
    const timer = setInterval(() => setUsage(snapshot()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return usage
}
