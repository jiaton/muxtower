import { Fragment, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ink, look } from '@/components/ui/intents'
import { AREA_LABEL, capsOf, overlayOpen, SHORTCUTS, typedInto, type Shortcut, type ShortcutArea } from '@/lib/shortcuts'
import { useShortcutSheet } from '../store'

/** The registry's shortcuts by area, in the sheet's order. */
export function shortcutsByArea(): { area: ShortcutArea; label: string; shortcuts: (Shortcut & { id: string })[] }[] {
  const all = Object.entries(SHORTCUTS).map(([id, s]) => ({ id, ...(s as Shortcut) }))
  return (Object.keys(AREA_LABEL) as ShortcutArea[]).map((area) => ({
    area,
    label: AREA_LABEL[area],
    shortcuts: all.filter((s) => s.area === area),
  }))
}

/** "?" (Shift+/ on a US keyboard; the character, wherever a layout puts it) outside a text field, the
 *  terminal and a dialog or menu: the sheet. */
export function sheetKey(e: KeyboardEvent): boolean {
  if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false
  return !typedInto(e.target) && !typedInto(document.activeElement) && !overlayOpen()
}

/** Every keyboard shortcut, by area, from the one registry (`lib/shortcuts.ts`): ⌘ ⌥ ⇧ ⌃ on a Mac, Ctrl,
 *  Alt and Shift elsewhere. Opened by "?" and ⌘K's "Keyboard shortcuts". */
export function ShortcutSheet() {
  const { open, setOpen } = useShortcutSheet()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sheetKey(e)) return
      e.preventDefault()
      useShortcutSheet.getState().setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? (
        <DialogContent title="Keyboard shortcuts" className="sm:max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            {shortcutsByArea().map(({ area, label, shortcuts }) => (
              <section key={area} aria-label={label} className="flex flex-col gap-1">
                <h3 className={ink.eyebrow}>{label}</h3>
                {shortcuts.map((s) => (
                  <div key={s.id} data-shortcut-id={s.id} className="flex min-h-7 items-center justify-between gap-3">
                    <span className={ink.body}>{s.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((chord, i) => (
                        <Fragment key={i}>
                          {i ? <span className={ink.meta}>or</span> : null}
                          {capsOf(chord).map((cap, j) => (
                            <kbd key={j} className={look.keycap}>
                              {cap}
                            </kbd>
                          ))}
                        </Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
