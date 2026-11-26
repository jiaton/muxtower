import { describe, expect, it } from 'vitest'
import { formatSize, splitName } from './file-name'

describe('splitName', () => {
  it('keeps the extension and the last letters before it, so the middle is what is cut', () => {
    expect(splitName('quarterly-report-final-v2.pdf')).toEqual({ head: 'quarterly-report-fi', tail: 'nal-v2.pdf' })
    expect(splitName('server.log.gz')).toEqual({ head: 'serv', tail: 'er.log.gz' }) // put together, the whole name
  })
  it('keeps a short name whole, and a name without an extension by its last letters', () => {
    expect(splitName('notes.md')).toEqual({ head: '', tail: 'notes.md' })
    expect(splitName('Makefile-of-the-old-build')).toEqual({ head: 'Makefile-of-the-old', tail: '-build' })
    expect(splitName('.env.example')).toEqual({ head: '', tail: '.env.example' })
  })
  it('does not take a long dotted tail for an extension', () => {
    expect(splitName('build.2026-01-05-nightly-output').tail).toBe('output')
  })
})

describe('formatSize', () => {
  it('reads as people read sizes', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(14_200)).toBe('14 KB')
    expect(formatSize(3_200_000)).toBe('3.2 MB')
    expect(formatSize(2_000_000)).toBe('2 MB')
    expect(formatSize(24_600_000)).toBe('25 MB')
  })
})
