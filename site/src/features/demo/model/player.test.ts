import { describe, expect, it } from 'vitest'
import { beatIndexAt, FLASH_MS, frameAt } from './player'
import { BEATS, DURATION } from './script'
import { sessionById } from './world'

describe('frameAt', () => {
  it('opens on the first beat with nothing happened yet', () => {
    const frame = frameAt(0)
    expect(frame.beat.id).toBe('machines')
    expect(frame.world.phone.screen).toBe('lock')
    expect(frame.world.map).toBe(false)
  })

  it('is a pure function of the time, so seeking back undoes what happened', () => {
    const later = frameAt(22000)
    expect(sessionById(later.world, 'worker')?.state).toBe('working')
    expect(sessionById(frameAt(1000).world, 'worker')?.state).toBe('idle')
    expect(frameAt(22000)).toEqual(later)
  })

  it('types the reply a character at a time', () => {
    const start = frameAt(11800).world.phone.draft
    const end = frameAt(12600).world.phone.draft
    expect(start.length).toBeGreaterThan(0)
    expect(end.startsWith(start)).toBe(true)
    expect(end.length).toBeGreaterThan(start.length)
  })

  it('lets a highlight fade after a while', () => {
    expect(frameAt(4300).world.flash).toBe('row-api')
    expect(frameAt(4200 + FLASH_MS + 100).world.flash).toBeNull()
  })

  it('clamps outside the demo and ends on the hub map', () => {
    expect(frameAt(-5).t).toBe(0)
    const end = frameAt(DURATION + 1000)
    expect(end.t).toBe(DURATION)
    expect(end.world.map).toBe(true)
  })

  it('remembers the last click for the ripple', () => {
    expect(frameAt(6500).clickAt).toBe(6400)
  })

  it('says where to look', () => {
    expect(frameAt(4300).focus?.note).toBe('A push from the VPS')
    expect(frameAt(37000).focus).toBeNull()
  })
})

describe('beatIndexAt', () => {
  it('finds the beat a time falls in', () => {
    BEATS.forEach((beat, i) => expect(beatIndexAt(beat.start)).toBe(i))
    expect(beatIndexAt(BEATS[1].start - 1)).toBe(0)
  })
})
