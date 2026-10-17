import { describe, expect, it } from 'vitest'
import { align } from './lines'

const lines = (...xs: string[]) => xs

describe('align', () => {
  it('detects output pushing lines off the top', () => {
    expect(align(lines('a', 'b', 'c', 'd', 'e'), lines('c', 'd', 'e', 'f', 'g'))).toEqual({ removeTop: 2, insertTop: 0 })
  })

  it('detects older history added on top', () => {
    expect(align(lines('c', 'd', 'e'), lines('a', 'b', 'c', 'd', 'e', 'f'))).toEqual({ removeTop: 0, insertTop: 2 })
  })

  it('treats a redraw in place as no shift', () => {
    expect(align(lines('a', 'b', 'c'), lines('a', 'b', 'x'))).toEqual({ removeTop: 0, insertTop: 0 })
  })
})
