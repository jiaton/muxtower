import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChipSwitchPrefs } from '../store'
import { useChipStepping } from './use-chip-keys'

function setup() {
  const list = document.createElement('div')
  const row = document.createElement('div')
  list.append(row)
  document.body.append(list)
  const onStep = vi.fn()
  const hook = renderHook(() => useChipStepping({ current: list }, onStep))
  return { list, row, onStep, hook }
}

const key = (k: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

const wheel = (target: EventTarget, init: WheelEventInit) => target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, ...init }))

describe('useChipStepping', () => {
  beforeEach(() => act(() => useChipSwitchPrefs.setState({ wheel: true })))
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('[ steps back and ] on, taking the key', () => {
    const { onStep } = setup()
    expect(key('[').defaultPrevented).toBe(true)
    key(']')
    expect(onStep.mock.calls).toEqual([[-1], [1]])
  })

  it('leaves [ and ] to a text field, the terminal, and keys with a modifier', () => {
    const { onStep } = setup()
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const terminal = document.createElement('div')
    terminal.setAttribute('data-own-keys', '')
    terminal.tabIndex = 0
    document.body.append(input, textarea, terminal)
    for (const field of [input, textarea, terminal]) {
      field.focus()
      expect(key(']', field).defaultPrevented).toBe(false)
    }
    document.body.focus()
    key(']', document.body, { ctrlKey: true })
    key(']', document.body, { metaKey: true })
    key(']', document.body, { altKey: true })
    key('}', document.body, { shiftKey: true })
    expect(onStep).not.toHaveBeenCalled()
  })

  it('leaves [ and ] alone while a dialog is open', () => {
    const { onStep } = setup()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('data-state', 'open')
    document.body.append(dialog)
    key(']')
    expect(onStep).not.toHaveBeenCalled()
  })

  it('steps for a sideways wheel over the list, once per gesture', () => {
    const { row, onStep } = setup()
    wheel(row, { deltaX: 120 })
    wheel(row, { deltaX: 120 })
    expect(onStep.mock.calls).toEqual([[1]])
  })

  it('takes Shift and a vertical wheel as sideways, in lines too', () => {
    const { row, onStep } = setup()
    wheel(row, { deltaY: -10, deltaMode: WheelEvent.DOM_DELTA_LINE, shiftKey: true }) // 10 lines: past a notch
    expect(onStep.mock.calls).toEqual([[-1]])
  })

  it('ignores a wheel outside the list', () => {
    const { onStep } = setup()
    wheel(document.body, { deltaX: 200 })
    expect(onStep).not.toHaveBeenCalled()
  })

  it('turned off for this browser, the wheel switches nothing; [ ] still do', () => {
    act(() => useChipSwitchPrefs.getState().setWheel(false))
    const { row, onStep } = setup()
    wheel(row, { deltaX: 200 })
    expect(onStep).not.toHaveBeenCalled()
    key(']')
    expect(onStep.mock.calls).toEqual([[1]])
  })
})
