import type { AnchorHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** A link in running text, to another site or a file (a route uses the router's Link). */
export function TextLink({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn('font-medium underline hover:text-accent', className)} {...props} />
}
