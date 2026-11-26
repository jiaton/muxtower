import { useEffect, useState } from 'react'

/** The time, read again every `ms`: countdowns stay live. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
