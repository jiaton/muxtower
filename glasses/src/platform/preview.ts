/** The GlassesPort in a plain browser: the "glasses" are a box on the page, driven by buttons or the
 *  keyboard (arrows, Enter, Backspace, M). Same events as the SDK sends, so the app cannot tell. */
import { MenuItemClickEvent, Sys_ItemEvent, Text_ItemEvent, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import type { GlassesPort, MenuItem } from './port'

type Listener = (event: EvenHubEvent) => void

const text = (eventType: number): EvenHubEvent => ({
  textEvent: new Text_ItemEvent({ containerID: 1, containerName: 'main', eventType }),
})
const sys = (eventType?: number): EvenHubEvent => ({ sysEvent: new Sys_ItemEvent(eventType === undefined ? {} : { eventType }) })

export const PREVIEW_INPUTS = {
  up: () => text(1),
  down: () => text(2),
  tap: () => sys(),
  'double tap': () => sys(3),
} satisfies Record<string, () => EvenHubEvent>

export function createPreview(
  screen: HTMLElement,
  menuBox: HTMLElement,
): { port: GlassesPort; emit: (event: EvenHubEvent) => void } {
  const listeners = new Set<Listener>()
  const emit = (event: EvenHubEvent) => listeners.forEach((l) => l(event))
  const keys: Record<string, () => EvenHubEvent> = {
    ArrowUp: PREVIEW_INPUTS.up,
    ArrowDown: PREVIEW_INPUTS.down,
    Enter: PREVIEW_INPUTS.tap,
    Backspace: PREVIEW_INPUTS['double tap'],
  }
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return
    const make = keys[e.key]
    if (make) {
      e.preventDefault()
      emit(make())
    }
  })
  const showMenu = (menu: MenuItem[]) => {
    menuBox.replaceChildren(
      ...menu.map((item) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = item.name
        button.onclick = () => emit({ menuItemClickEvent: new MenuItemClickEvent({ itemID: item.id }) })
        return button
      }),
    )
  }
  const port: GlassesPort = {
    async create(content: string, menu: MenuItem[]) {
      screen.textContent = content
      showMenu(menu)
      return true
    },
    async update(content: string) {
      screen.textContent = content
      return true
    },
    onEvent(listener: Listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async getItem(key: string) {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    async setItem(key: string, value: string) {
      try {
        localStorage.setItem(key, value)
      } catch {
        // Private mode: the preview just forgets.
      }
    },
    async exit() {
      screen.textContent = ''
    },
  }
  return { port, emit }
}
