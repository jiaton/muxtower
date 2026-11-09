import { describe, expect, it } from 'vitest'
import { feedbackOf } from './feedback'

describe('what the Live row says about something heard', () => {
  it('commands, in a word; how they were heard only with details on', () => {
    expect(feedbackOf({ kind: 'command', command: 'send', done: true, how: 'on device' }, false)).toBe('✓ sent')
    expect(feedbackOf({ kind: 'command', command: 'send', done: true, how: 'on device' }, true)).toBe('✓ sent (on device)')
    expect(feedbackOf({ kind: 'command', command: 'pause', done: true, how: 'transcribed' }, false)).toBe('✓ paused')
    expect(feedbackOf({ kind: 'command', command: 'undo', done: true, how: 'transcribed' }, false)).toBe('✓ undone')
    expect(feedbackOf({ kind: 'command', command: 'send', done: false, how: 'on device' }, false)).toBe('nothing to send')
    expect(feedbackOf({ kind: 'command', command: 'undo', done: false, how: 'on device' }, false)).toBe('nothing to undo')
  })

  it('words written: nothing (the box shows them); a short one that was no command, with details', () => {
    expect(feedbackOf({ kind: 'text', text: 'fix the login test', short: false }, false)).toBeNull()
    expect(feedbackOf({ kind: 'text', text: 'fix the login test', short: false }, true)).toBeNull()
    expect(feedbackOf({ kind: 'text', text: 'Façam', short: true }, false)).toBeNull()
    expect(feedbackOf({ kind: 'text', text: 'Façam', short: true }, true)).toBe('transcribed: Façam (not a command)')
  })

  it('not caught: said when too short or failed; other reasons only with details', () => {
    expect(feedbackOf({ kind: 'ignored', why: 'too short' }, false)).toBe("didn't catch that (too short)")
    expect(feedbackOf({ kind: 'ignored', why: 'failed' }, false)).toBe("didn't catch that (transcription failed)")
    expect(feedbackOf({ kind: 'ignored', why: 'too quiet' }, false)).toBeNull()
    expect(feedbackOf({ kind: 'ignored', why: 'too quiet' }, true)).toBe('ignored: too quiet')
  })
})
