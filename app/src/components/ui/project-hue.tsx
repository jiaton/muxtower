import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check, FolderGit2 } from 'lucide-react'
import type { HTMLAttributes, KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { look } from './intents'
import { text } from './styles'

/**
 * A project's colour: one of six soft hues (tokens.css, `--color-project-N`), kept on the hub and given there
 * as the project is first seen; `null` is none yet, shown neutral (never a guess). Never a state: the hues sit
 * away from the state colours at about half their chroma, and say only "this project". Shown as a tinted tag
 * (`ProjectTag`) or a dot in an icon's place (`ProjectIcon`), and picked in a project's menu
 * (`ProjectHuePicker`). Static class names, so Tailwind finds each one.
 */
export const PROJECT_HUES = [
  { hue: 1, name: 'Rose' },
  { hue: 2, name: 'Teal' },
  { hue: 3, name: 'Ochre' },
  { hue: 4, name: 'Mauve' },
  { hue: 5, name: 'Moss' },
  { hue: 6, name: 'Clay' },
] as const

const DOT: Record<number, string> = {
  1: 'bg-project-1',
  2: 'bg-project-2',
  3: 'bg-project-3',
  4: 'bg-project-4',
  5: 'bg-project-5',
  6: 'bg-project-6',
}
const TINT: Record<number, string> = {
  1: 'bg-project-1-soft text-project-1-ink',
  2: 'bg-project-2-soft text-project-2-ink',
  3: 'bg-project-3-soft text-project-3-ink',
  4: 'bg-project-4-soft text-project-4-ink',
  5: 'bg-project-5-soft text-project-5-ink',
  6: 'bg-project-6-soft text-project-6-ink',
}

export const hueName = (hue: number | null) => PROJECT_HUES.find((h) => h.hue === hue)?.name ?? null

/** A small round dot in a hue. Smaller than `StatusDot` (a machine's state), so the two never read alike. */
function Dot({ hue, className }: { hue: number; className?: string }) {
  return <span aria-hidden data-hue={hue} className={cn('inline-block size-2 shrink-0 rounded-full', DOT[hue], className)} />
}

/** A project's name as a tag: tinted with its hue (its ground and text in the hue), else neutral (`look.tag`).
 *  Not `look.tag` itself: that one is a device's or a role's, never coloured. */
export function ProjectTag({ hue, className, ...rest }: { hue: number | null } & HTMLAttributes<HTMLSpanElement>) {
  const tinted = hue !== null && TINT[hue]
  return (
    <span
      data-hue={tinted ? hue : undefined}
      className={cn(tinted ? `${text({ size: 'xs' })} rounded-md px-1.5 ${TINT[hue]}` : look.tag, className)}
      {...rest}
    />
  )
}

/** What stands before a project's name where an icon would (a sidebar item, a list's group header): its dot,
 *  centred in a box the icon's size; the project icon while it has no hue. Decorative: the name says it. */
export function ProjectIcon({ hue, className }: { hue: number | null; className?: string }) {
  if (hue === null || !DOT[hue]) return <FolderGit2 aria-hidden className={className} />
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center', className)}>
      <Dot hue={hue} />
    </span>
  )
}

/** Left and right move between the swatches too (the menu's own keys are up and down). */
function moveSideways(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
  const at = items.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  e.preventDefault()
  e.stopPropagation()
  items[(at + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]?.focus()
}

/**
 * A project's colour as a menu's items (inside `DropdownMenuContent`, so a phone gets it in the sheet): a
 * label, then the six hues as round swatches in a row, a radio group, the current one ringed and ticked.
 * The arrows move between them (up and down as in any menu, left and right along the row), Enter or Space
 * picks one, which closes the menu.
 */
export function ProjectHuePicker({ hue, onPick, label = 'Colour' }: { hue: number | null; onPick: (hue: number) => void; label?: string }) {
  return (
    <>
      <Menu.Label className="px-2 pt-2 pb-1 text-xs font-medium text-fg-muted">{label}</Menu.Label>
      <Menu.RadioGroup
        aria-label={label}
        value={hue === null ? '' : String(hue)}
        onValueChange={(v) => onPick(Number(v))}
        onKeyDown={moveSideways}
        className="flex items-center gap-1 px-1 pb-1"
      >
        {PROJECT_HUES.map(({ hue: h, name }) => (
          <Menu.RadioItem
            key={h}
            value={String(h)}
            aria-label={name}
            title={name}
            data-hue={h}
            className={cn(
              'flex size-8 cursor-default items-center justify-center rounded-full outline-none select-none',
              'data-[highlighted]:bg-surface-muted data-[state=checked]:ring-2 data-[state=checked]:ring-fg-muted data-[state=checked]:ring-inset',
            )}
          >
            <span className={cn('flex size-5 items-center justify-center rounded-full', DOT[h])}>
              <Menu.ItemIndicator>
                <Check aria-hidden className="size-3.5 text-surface" />
              </Menu.ItemIndicator>
            </span>
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </>
  )
}
