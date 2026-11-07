import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useTokenMenu, type TokenRow, type TokenSource } from './token-menu'

const picked = vi.fn()
const source: TokenSource = {
  label: 'Mention',
  at: (value, caret) => {
    const i = value.slice(0, caret).lastIndexOf('@')
    const q = i < 0 ? '' : value.slice(i + 1, caret)
    return i < 0 || /\s/.test(q) ? null : { start: i, query: q }
  },
  rows: (query, open): TokenRow[] => {
    const people = ['ana', 'bo', 'cy'].filter((n) => n.includes(query))
    const team = open.has('team') ? [{ key: 'dee', label: 'dee', text: '@dee' }] : [{ key: 'g', label: 'team · 1', group: 'team' }]
    return [...people.map((n) => ({ key: n, label: n, text: `@${n}` })), ...(query ? [] : team)]
  },
  picked,
}

function Field({ onEnter }: { onEnter?: () => void }) {
  const el = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')
  const menu = useTokenMenu(source, el, value, setValue)
  return (
    <>
      <textarea
        ref={el}
        aria-label="box"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onSelect={menu.sync}
        onKeyDown={(e) => menu.onKeyDown(e) || (e.key === 'Enter' && onEnter?.())}
      />
      {menu.menu}
    </>
  )
}

const box = () => screen.getByRole('textbox', { name: 'box' }) as HTMLTextAreaElement
const type = (value: string) => {
  box().focus()
  fireEvent.change(box(), { target: { value, selectionStart: value.length } })
  box().setSelectionRange(value.length, value.length)
  fireEvent.select(box())
}
const options = () => screen.getAllByRole('option').map((o) => `${o.textContent}${o.getAttribute('aria-selected') === 'true' ? '*' : ''}`)

describe('useTokenMenu', () => {
  it('opens on its trigger, moves with Up and Down, inserts with Enter and puts the caret after', () => {
    const onEnter = vi.fn()
    render(<Field onEnter={onEnter} />)
    type('hi ')
    expect(screen.queryByRole('listbox')).toBeNull()
    type('hi @')
    expect(options()).toEqual(['ana*', 'bo', 'cy', 'team · 1'])
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'ArrowUp' })
    expect(options()[1]).toBe('bo*')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(box().value).toBe('hi @bo ')
    expect(box().selectionStart).toBe('hi @bo '.length)
    expect(onEnter).not.toHaveBeenCalled() // the menu's Enter, not the field's
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ key: 'bo' }))
  })

  it('filters as one types, inserts with Tab, and Esc closes it until the caret leaves', () => {
    render(<Field />)
    type('@c')
    expect(options()).toEqual(['cy*'])
    fireEvent.keyDown(box(), { key: 'Tab' })
    expect(box().value).toBe('@cy ')
    type('@cy @a')
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    type('@cy @an')
    expect(screen.queryByRole('listbox')).toBeNull() // still that one
    type('@cy @an @')
    expect(screen.getByRole('listbox')).toBeInTheDocument() // a new one
  })

  it("leaves an input method's Enter alone, opens a folded group in place, and takes a tap", () => {
    const onEnter = vi.fn()
    render(<Field onEnter={onEnter} />)
    type('@')
    fireEvent.keyDown(box(), { key: 'Enter', keyCode: 229, isComposing: true })
    expect(box().value).toBe('@') // composing: not the menu's (nor inserted)
    for (let i = 0; i < 3; i++) fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'Enter' }) // the folded team
    expect(options()).toEqual(['ana', 'bo', 'cy', 'dee*'])
    fireEvent.click(screen.getByRole('option', { name: 'ana' }))
    expect(box().value).toBe('@ana ')
  })
})
