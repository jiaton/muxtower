import { TriangleAlert } from 'lucide-react'
import { Banner } from '@/components/ui/banner'
import { useDaemonsStore } from '@/lib/daemons/store'
import { hasUnacknowledgedTokens, useRuntimeConfig } from '@/lib/runtime-config'

/** Warns when this deployment ships daemon tokens in its public config.json. */
export function PresetWarning() {
  const { data } = useRuntimeConfig()
  const presets = useDaemonsStore((s) => s.daemons.some((d) => d.preset))
  if (hasUnacknowledgedTokens(data))
    return (
      <Banner tone="warning">
        <TriangleAlert />
        <span>
          This deployment's config.json contains daemon tokens but does not set <code>acknowledge_public_tokens</code>, so they were
          ignored. Remove them, or put the app behind an access gate and acknowledge.
        </span>
      </Banner>
    )
  if (presets)
    return (
      <Banner tone="warning">
        <TriangleAlert />
        <span>
          This deployment comes with daemon tokens built in. Anyone who can open this page controls those daemons: keep it behind an access
          gate (Cloudflare Access, your own SSO).
        </span>
      </Banner>
    )
  return null
}
