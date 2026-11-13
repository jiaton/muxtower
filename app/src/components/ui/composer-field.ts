import { cva } from 'class-variance-authority'
import { focusWithinRing } from './styles'

/** The message box: what a message quotes and pictures on top, the text under them, one field. `glow`: the
 *  words just landed in it (Live). */
export const composerField = cva(
  `flex min-w-0 flex-1 flex-col rounded-md border bg-surface transition-colors duration-500 ${focusWithinRing}`,
  { variants: { glow: { true: 'border-accent ring-2 ring-accent/40', false: 'border-border' } }, defaultVariants: { glow: false } },
)

/** The message box's text: one line high (the box 40 px with its border), growing with what is typed up to
 *  ten lines. On a bare Textarea. */
export const composerText = 'max-h-40 min-h-[2.375rem] field-sizing-content py-[0.4375rem]'
