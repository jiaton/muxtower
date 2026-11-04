import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins classes and lets a later Tailwind class win', () => {
    const hidden = false
    expect(cn('px-2', hidden && 'hidden', 'px-4')).toBe('px-4')
  })
})
