/** Draws screens on the glasses: the first draw creates the page, later ones only replace its text.
 *  One draw is in flight at a time and only the latest screen is drawn; an unchanged screen is skipped. */
import type { GlassesPort, MenuItem } from '@/platform/port'
import { compose, type Screen } from './screen'

export class Renderer {
  private shown: string | null = null
  private next: string | null = null
  private busy = false
  private created = false

  private readonly port: GlassesPort
  private readonly menu: MenuItem[]

  constructor(port: GlassesPort, menu: MenuItem[]) {
    this.port = port
    this.menu = menu
  }

  /** The text last drawn (for the phone panel's mirror and for tests). */
  get current() {
    return this.shown
  }

  show(screen: Screen): Promise<void> {
    this.next = compose(screen)
    return this.flush()
  }

  private async flush() {
    if (this.busy) return
    this.busy = true
    try {
      while (this.next !== null) {
        const text = this.next
        this.next = null
        if (text === this.shown) continue
        const ok = this.created ? await this.port.update(text) : await this.port.create(text, this.menu)
        if (ok) {
          this.created = true
          this.shown = text
        }
      }
    } finally {
      this.busy = false
    }
  }
}
