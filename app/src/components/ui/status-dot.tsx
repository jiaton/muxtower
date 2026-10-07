import { cn } from '@/lib/cn'

const TONES = { ok: 'bg-success', warn: 'bg-state-permission', error: 'bg-state-error', idle: 'bg-state-idle' } as const

export function StatusDot({ tone, label }: { tone: keyof typeof TONES; label: string }) {
  return <span role="img" aria-label={label} title={label} className={cn('inline-block size-2.5 shrink-0 rounded-full', TONES[tone])} />
}
