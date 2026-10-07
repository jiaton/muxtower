import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { normalizeUrl, useDaemonsStore } from '@/lib/daemons/store'

/**
 * Optional `/config.json` served next to index.html. Nothing about a daemon is baked into the bundle.
 *
 * - The daemon's bundled UI gets `{ "daemons": [{ "name", "url" }] }` (itself, unpaired).
 * - A self-hosted deployment may preset daemons. A preset `token` is used only when the deployment also
 *   sets `acknowledge_public_tokens: true`, because anyone who can load the page can read it.
 */
export interface RuntimeConfig {
  daemons?: Array<{ name: string; url: string; token?: string }>
  acknowledge_public_tokens?: boolean
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' })
    if (!res.ok) return {}
    return (await res.json()) as RuntimeConfig
  } catch {
    return {}
  }
}

export function useRuntimeConfig() {
  return useQuery({ queryKey: ['runtime-config'], queryFn: loadRuntimeConfig, staleTime: Infinity })
}

/** Adds the configured daemons to this device's list (mounted once, in the root layout). */
export function useConfiguredDaemons() {
  const { data } = useRuntimeConfig()
  useEffect(() => {
    if (!data?.daemons) return
    const { daemons, add } = useDaemonsStore.getState()
    for (const entry of data.daemons) {
      const url = normalizeUrl(entry.url)
      const known = daemons.find((d) => d.url === url)
      const token = data.acknowledge_public_tokens && entry.token ? entry.token : null
      if (!known) add({ name: entry.name, url, token, preset: token !== null })
      else if (token && !known.token) add({ ...known, token, preset: true })
    }
  }, [data])
}

/** True when the deployment ships tokens it did not acknowledge (they are ignored, but should be removed). */
export const hasUnacknowledgedTokens = (config: RuntimeConfig | undefined) =>
  !!config?.daemons?.some((d) => d.token) && !config.acknowledge_public_tokens
