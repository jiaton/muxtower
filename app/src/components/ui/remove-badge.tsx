import { X } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './button'
import { box, text } from './styles'

/** The small round × on a thumbnail's corner that takes it away. Placed by the caller (its position). */
export function RemoveBadge({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      variant="plain"
      className={cn(
        box({ radius: 'full', ground: 'inverse', shadow: 'sm' }),
        text({ tone: 'inverse' }),
        'flex size-5 items-center justify-center',
        className,
      )}
      {...props}
    >
      <X className="size-3" aria-hidden />
    </Button>
  )
}
