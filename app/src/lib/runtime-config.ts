/** Optional `/config.json` next to index.html. Nothing about a daemon is baked into the bundle. */
export interface RuntimeConfig {
  bundled_daemon?: { name: string; url: string }
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' })
    if (!res.ok) return {}
    return (await res.json()) as RuntimeConfig
  } catch {
    return {}
  }
}
