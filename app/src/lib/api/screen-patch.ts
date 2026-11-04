import type { components } from './schema'

type Op = components['schemas']['ScreenPatchFrame']['ops'][number]

/**
 * A screen put together from a `screen_patch`: `[start, count]` copies those lines of the screen it builds
 * on, a string is a new line. Null when an op does not fit that screen: then a whole one is asked for.
 * What the app keeps (the query cache) is only ever a whole screen.
 */
export function applyPatch(base: string[], ops: Op[]): string[] | null {
  const out: string[] = []
  for (const op of ops) {
    if (typeof op === 'string') {
      out.push(op)
      continue
    }
    const [start, count] = op
    if (start < 0 || count < 0 || start + count > base.length) return null
    for (let i = start; i < start + count; i++) out.push(base[i])
  }
  return out
}

/** The last whole screen of each session, numbered, that a patch can build on (per stream). */
export class ScreenBases {
  private readonly bases = new Map<string, { seq: number; lines: string[] }>()

  /** A whole screen: kept, when numbered, for the patches after it. */
  whole(sessionId: string, ansi: string, seq: number | null | undefined) {
    if (seq == null) this.bases.delete(sessionId)
    else this.bases.set(sessionId, { seq, lines: ansi.split('\n') })
  }

  /** The screen a patch makes, or null when it does not build on the one kept (subscribe again). */
  patch(sessionId: string, base: number, seq: number, ops: Op[]): string | null {
    const kept = this.bases.get(sessionId)
    const lines = kept && kept.seq === base ? applyPatch(kept.lines, ops) : null
    if (!lines) {
      this.bases.delete(sessionId)
      return null
    }
    this.bases.set(sessionId, { seq, lines })
    return lines.join('\n')
  }
}
