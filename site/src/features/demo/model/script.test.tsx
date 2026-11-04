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

  // The cursor and the spotlight aim at elements by id: each must be on screen when they go there, in both layouts.
  const aimed = STEPS.flatMap((s) => [s.cursor, s.focus].filter(Boolean).map((t) => [s.at, t!] as const))
  it.each(aimed)('at %i ms its target is drawn', (at, target) => {
    const { world } = frameAt(at + 1)
    const wide = render(
      <>
        <DesktopWindow world={world} />
        <Phone world={world} />
      </>,
    )
    if (target.wide) expect(wide.container.querySelector(`[data-demo="${target.wide}"]`)).not.toBeNull()
    wide.unmount()
    const tall = render(
      <>
        <MachineStrip world={world} />
        <Phone world={world} />
      </>,
    )
    if (target.tall) expect(tall.container.querySelector(`[data-demo="${target.tall}"]`)).not.toBeNull()
    tall.unmount()
  })
})
