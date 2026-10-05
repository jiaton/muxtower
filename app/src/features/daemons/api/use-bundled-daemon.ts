import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { loadRuntimeConfig } from '@/lib/runtime-config'
import { useDaemonsStore } from '../store'

/** When served by muxtowerd, register that daemon (unpaired) so the user only has to pair it. */
export function useBundledDaemon() {
  const { data } = useQuery({ queryKey: ['runtime-config'], queryFn: loadRuntimeConfig, staleTime: Infinity })
  const bundled = data?.bundled_daemon
  useEffect(() => {
    if (!bundled) return
    const { daemons, add } = useDaemonsStore.getState()
    if (!daemons.some((d) => d.url === bundled.url.replace(/\/+$/, ''))) {
      add({ name: bundled.name, url: bundled.url, token: null })
    }
  }, [bundled])
}
