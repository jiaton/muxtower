import * as SwitchPrimitive from '@radix-ui/react-switch'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { focusRing } from './styles'

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        `inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent bg-border transition-colors ${focusRing} disabled:opacity-50 data-[state=checked]:bg-accent`,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-surface shadow-card transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  )
}
