import { beforeEach, describe, expect, it } from 'vitest'
import { useDaemonsStore } from './store'

describe('daemons store', () => {
  beforeEach(() => useDaemonsStore.setState({ daemons: [] }))

  it('keeps several daemons', () => {
    const { add } = useDaemonsStore.getState()
    add({ name: 'a', url: 'https://a.example/', token: 't1' })
    add({ name: 'b', url: 'https://b.example', token: 't2' })
    expect(useDaemonsStore.getState().daemons.map((d) => d.url)).toEqual(['https://a.example', 'https://b.example'])
  })

  it('re-adding the same url updates instead of duplicating, and never drops a token', () => {
    const { add } = useDaemonsStore.getState()
    add({ name: 'a', url: 'https://a.example', token: 'paired' })
    add({ name: 'a', url: 'https://a.example/', token: null })
    const { daemons } = useDaemonsStore.getState()
    expect(daemons).toHaveLength(1)
    expect(daemons[0].token).toBe('paired')
  })
})
