export interface Daemon {
  id: string
  name: string
  url: string
  /** Null until the daemon has been paired (e.g. the bundled daemon before pairing). */
  token: string | null
}
