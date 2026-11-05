/** The page the Even App shows on the phone: pairing, the link's state, and a mirror of the glasses.
 *  In a plain browser it also drives the preview glasses (buttons and keyboard). */
import type { GlassesApp } from '@/app'
import { DEVICE_NAME } from '@/hub/pairing'
import type { AppStore } from '@/state/store'
import { isShown, needsYou } from '@/state/model'

const LINK = {
  unpaired: 'Not paired',
  connecting: 'Connecting…',
  open: 'Connected',
  down: 'Hub unreachable, retrying',
  rejected: 'This device was unpaired on the hub',
} as const

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  Object.assign(node, props)
  node.append(...children)
  return node
}

export interface Panel {
  /** Where the preview glasses draw (a plain browser only). */
  screen: HTMLElement
  menu: HTMLElement
  controls: HTMLElement
  bind(app: GlassesApp, store: AppStore): void
}

export function mountPanel(root: HTMLElement, preview: boolean): Panel {
  const linkValue = el('dd')
  const hubValue = el('dd')
  const sessionsValue = el('dd')
  const status = el('section', { className: 'card' }, el('h1', {}, 'muxtower for G2'), el('dl', {}, el('dt', {}, 'Hub'), hubValue, el('dt', {}, 'Link'), linkValue, el('dt', {}, 'Sessions'), sessionsValue))

  const code = el('input', { placeholder: 'ABCD-EFGH', autocomplete: 'off', ariaLabel: 'Pairing code', maxLength: 16 })
  const name = el('input', { value: DEVICE_NAME, autocomplete: 'off', ariaLabel: 'Device name', maxLength: 60, className: 'name' })
  const pairError = el('p', { className: 'error', hidden: true })
  const pairButton = el('button', { className: 'primary', type: 'submit' }, 'Pair')
  const pairForm = el(
    'form',
    { className: 'card' },
    el('p', {}, 'Pair these glasses with the hub'),
    el('p', { className: 'muted' }, 'Get a code with `muxtower pair` on the hub, or from "Add another device" in the web app (the code under the QR).'),
    el('div', { className: 'row' }, code, pairButton),
    el('label', { className: 'muted' }, 'Name on the hub ', name),
    pairError,
  )
  const unpairButton = el('button', { type: 'button' }, 'Forget this pairing')
  const paired = el('section', { className: 'card' }, el('p', { className: 'muted' }, 'Paired. Revoke the device from the web app to cut it off for good.'), el('div', { className: 'row' }, unpairButton))

  const screen = el('pre', { className: 'glasses', ariaLabel: 'What the glasses show' })
  const controls = el('div', { className: 'row' })
  const menu = el('div', { className: 'row' })
  const mirror = el(
    'section',
    { className: 'card' },
    el('p', { className: 'muted' }, preview ? 'Preview glasses (arrows, Enter, Backspace)' : 'On the glasses now'),
    screen,
    ...(preview ? [controls, el('p', { className: 'muted' }, 'System menu'), menu] : []),
  )
  root.replaceChildren(status, pairForm, paired, mirror)

  return {
    screen,
    menu,
    controls,
    bind(app, store) {
      hubValue.textContent = app.hubUrl
      if (!preview) app.mirror((text) => (screen.textContent = text))
      const update = () => {
        const state = store.getState()
        linkValue.textContent = LINK[state.link]
        sessionsValue.textContent = state.loaded ? `${state.sessions.filter(isShown).length} (${needsYou(state.sessions).length} need you)` : '—'
        const unpaired = state.link === 'unpaired' || state.link === 'rejected'
        pairForm.hidden = !unpaired
        paired.hidden = unpaired
      }
      store.subscribe(update)
      update()
      pairForm.onsubmit = async (event) => {
        event.preventDefault()
        pairButton.disabled = true
        pairError.hidden = true
        try {
          await app.pair(code.value, name.value)
          code.value = ''
        } catch (error) {
          pairError.textContent = error instanceof Error ? error.message : 'Pairing failed'
          pairError.hidden = false
        } finally {
          pairButton.disabled = false
        }
      }
      unpairButton.onclick = () => void app.unpair()
    },
  }
}
