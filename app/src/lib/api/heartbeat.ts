/** No frame for this long: ask the daemon whether the connection still works (a phone that changed
 *  networks keeps an `open` socket that nothing arrives on). */
export const IDLE_MS = 25000
/** No answer (any frame) this long after asking: the connection is dead. */
export const PONG_TIMEOUT_MS = 5000

/** Tells a dead connection from a quiet one: after a while without a frame it asks (`ping`), and when
 *  nothing comes back in time it gives up (`dead`). Any frame counts as an answer. */
export class Heartbeat {
  private idle: ReturnType<typeof setTimeout> | undefined
  private asked: ReturnType<typeof setTimeout> | undefined
  private readonly ping: () => void
  private readonly dead: () => void

  constructor(ping: () => void, dead: () => void) {
    this.ping = ping
    this.dead = dead
  }

  /** A frame arrived (or the connection just opened). */
  heard() {
    this.stop()
    this.idle = setTimeout(() => this.ask(), IDLE_MS)
  }

  /** Ask now (unless already asking). */
  ask() {
    if (this.asked) return
    this.ping()
    this.asked = setTimeout(() => {
      this.asked = undefined
      this.dead()
    }, PONG_TIMEOUT_MS)
  }

  stop() {
    clearTimeout(this.idle)
    clearTimeout(this.asked)
    this.asked = undefined
  }
}
