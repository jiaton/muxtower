import * as React from 'react'
import { cn } from 'cn'

const LOOKS = {
  /** The app's name and mark, going back to the top. */
  brand: 'font-mono text-sm font-semibold',
  /** One of a row of quiet links (header, footer): the foreground on hover. */
  nav: 'transition-colors hover:text-foreground',
} as const

/** A link that is not a button: the brand, or one in a row of links. */
export function TextLink({ look, className, ...props }: React.ComponentProps<'a'> & { look: keyof typeof LOOKS }) {
  return <a className={cn(LOOKS[look], className)} {...props} />
}
