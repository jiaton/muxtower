import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { look } from './intents'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(look.card, 'p-4', className)} {...props} />
}
