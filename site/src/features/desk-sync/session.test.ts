import { describe, expect, it } from 'vitest'
import { DESK } from './session'

describe('the desk session', () => {
  it('asks for a command and says the same command was allowed', () => {
    expect(DESK.answered).toContain(DESK.command.split(' --')[0])
  })
})
