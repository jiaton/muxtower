import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DesktopWindow } from '../components/desktop-window'
import { MachineStrip } from '../components/machine-strip'
import { Phone } from '../components/phone'
import { frameAt } from './player'
import { BEATS, DURATION, STEPS } from './script'

describe('the script', () => {
  it('runs in order, within the demo', () => {
    const times = STEPS.map((s) => s.at)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(Math.max(...times)).toBeLessThan(DURATION)
    const starts = BEATS.map((b) => b.start)
    expect(starts).toEqual(starts.toSorted((a, b) => a - b))
  })

  it('gives every beat a title and one sentence', () => {
    for (const beat of BEATS) {
      expect(beat.title.length).toBeGreaterThan(0)
      expect(beat.caption).toMatch(/\.$/)
    }
  })

  // The cursor aims at elements by id: each one must be on screen when the cursor goes there, in both layouts.
  it.each(STEPS.filter((s) => s.cursor).map((s) => [s.at, s.cursor!] as const))('at %i ms its target is drawn', (at, cursor) => {
    const { world } = frameAt(at + 1)
    const wide = render(
      <>
        <DesktopWindow world={world} />
        <Phone world={world} />
      </>,
    )
    if (cursor.wide) expect(wide.container.querySelector(`[data-demo="${cursor.wide}"]`)).not.toBeNull()
    wide.unmount()
    const tall = render(
      <>
        <MachineStrip world={world} />
        <Phone world={world} />
      </>,
    )
    if (cursor.tall) expect(tall.container.querySelector(`[data-demo="${cursor.tall}"]`)).not.toBeNull()
    tall.unmount()
  })
})
