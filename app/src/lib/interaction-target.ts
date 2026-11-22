/**
 * Where a key or a tap landed, said without anything the page shows: the nearest area the app named
 * (`data-component`, a fixed phrase such as "message box" or "session list") and the role of what was
 * pressed (button, link, textbox…). Never text, a value, a title or an `aria-label`: labels here carry
 * session names ("Actions for …"), and what is typed or shown must never leave the page in a diagnostic.
 */

const IMPLIED: Record<string, string> = {
  BUTTON: 'button',
  A: 'link',
  TEXTAREA: 'textbox',
  SELECT: 'listbox',
  SUMMARY: 'button',
}
const INPUT_ROLES: Record<string, string> = { checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button' }
/** A role attribute is ours (a word of ARIA's), never a value: only these are said. */
const ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'option',
  'menu',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'checkbox',
  'radio',
  'radiogroup',
  'switch',
  'slider',
  'tab',
  'tablist',
  'dialog',
  'alertdialog',
  'log',
  'list',
  'listitem',
  'navigation',
  'region',
  'separator',
])
/** Containers that name an area where the app named none (a menu, a dialog in a portal). */
const CONTAINERS = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]'
/** What a component name may be: a short phrase of lower-case words, never anything longer. */
const NAME = /^[a-z][a-z ⌘-]{0,39}$/

function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role')
  if (explicit) return ROLES.has(explicit) ? explicit : null
  if (el.tagName === 'INPUT') return INPUT_ROLES[(el as HTMLInputElement).type] ?? 'textbox'
  if (el.tagName === 'A' && !el.hasAttribute('href')) return null
  return IMPLIED[el.tagName] ?? ((el as HTMLElement).isContentEditable ? 'textbox' : null)
}

const componentOf = (el: Element | null): string | null => {
  const named = el?.closest('[data-component]')?.getAttribute('data-component') ?? null
  return named !== null && NAME.test(named) ? named : null
}

/** "the message box", "a button in the session list", "a menuitem in a menu", "the page"; null for nothing. */
export function describeTarget(node: Node | null | undefined): string | null {
  if (!node) return null
  const start = node instanceof Element ? node : node.parentElement
  if (!start) return null
  if (start === document.body || start === document.documentElement) return 'the page'
  // What was pressed: the target, or the control it is inside (an icon in a button).
  let pressed: Element | null = start
  let role: string | null = null
  for (let el: Element | null = start, depth = 0; el && depth < 6; el = el.parentElement, depth++) {
    role = roleOf(el)
    if (role) {
      pressed = el
      break
    }
  }
  const own = pressed?.getAttribute('data-component')
  if (own && NAME.test(own)) return `the ${own}`
  const component = componentOf(pressed ?? start)
  const container = component ? null : (pressed ?? start).closest(CONTAINERS)
  const where = component ? `the ${component}` : container ? `a ${roleOf(container) ?? 'dialog'}` : null
  if (role && where) return `a ${role} in ${where}`
  if (role) return `a ${role}`
  return where
}
