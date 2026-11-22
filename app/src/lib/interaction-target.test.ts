import { afterEach, expect, it } from 'vitest'
import { describeTarget } from './interaction-target'

afterEach(() => document.body.replaceChildren())

const mount = (html: string) => {
  document.body.innerHTML = html
  return document.body
}

it('names the area the app named and the role pressed, never text, a value or a label', () => {
  const page = mount(`
    <section data-component="session list">
      <button aria-label="Actions for Secret launch plan" title="Secret launch plan"><svg><path id="icon"/></svg> Secret launch plan</button>
      <div id="row">Secret launch plan</div>
    </section>
    <section data-component="session">
      <textarea data-component="message box" id="box">my private draft</textarea>
      <div data-component="terminal" role="log" aria-label="Session output"><span id="line">top secret output</span></div>
    </section>`)
  const said = [
    describeTarget(page.querySelector('#icon')),
    describeTarget(page.querySelector('#row')),
    describeTarget(page.querySelector('#box')),
    describeTarget(page.querySelector('#line')!.firstChild),
  ]
  expect(said).toEqual(['a button in the session list', 'the session list', 'the message box', 'the terminal'])
  for (const s of said) expect(s).not.toMatch(/secret|private|draft|launch|output/i)
})

it('falls back to a menu or dialog, then the role alone, and says nothing for nothing', () => {
  const page = mount(`
    <div role="menu"><div role="menuitem" id="item">Archive Secret</div></div>
    <a href="#" id="link">Somewhere</a>
    <div id="plain">Text</div>
    <input type="checkbox" id="check" />`)
  expect(describeTarget(page.querySelector('#item'))).toBe('a menuitem in a menu')
  expect(describeTarget(page.querySelector('#link'))).toBe('a link')
  expect(describeTarget(page.querySelector('#plain'))).toBeNull()
  expect(describeTarget(page.querySelector('#check'))).toBe('a checkbox')
  expect(describeTarget(document.body)).toBe('the page')
  expect(describeTarget(null)).toBeNull()
})

it('never says a component name that is not a short fixed phrase', () => {
  const page = mount(`<div data-component="Draft: call me at 555"><button id="b">x</button></div>`)
  expect(describeTarget(page.querySelector('#b'))).toBe('a button')
})
