/** The GlassesPort on real hardware (and in the official simulator): the Even App's WebView bridge. */
import {
  CreateStartUpPageContainer,
  MenuContainerProperty,
  MenuItemProperty,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { DISPLAY_HEIGHT, DISPLAY_WIDTH, PADDING } from '@/display/limits'
import type { GlassesPort, MenuItem } from './port'

const MAIN = { containerID: 1, containerName: 'main' }

/** True inside the Even App (or the simulator), where the bridge exists. */
export const insideEvenApp = () => 'flutter_inappwebview' in window

export async function connectEven(): Promise<GlassesPort> {
  const bridge = await waitForEvenAppBridge()
  return {
    async create(text: string, menu: MenuItem[]) {
      const page = {
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({
            ...MAIN,
            xPosition: 0,
            yPosition: 0,
            width: DISPLAY_WIDTH,
            height: DISPLAY_HEIGHT,
            paddingLength: PADDING,
            content: text,
            isEventCapture: 1,
          }),
        ],
        menuObject: new MenuContainerProperty({
          menuItems: menu.map((m) => new MenuItemProperty({ itemID: m.id, itemName: m.name })),
        }),
      }
      const created = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page))
      if (created === StartUpPageCreateResult.success) return true
      // The page already exists (the WebView reloaded while the app stayed open): rebuild it instead.
      return bridge.rebuildPageContainer(new RebuildPageContainer(page))
    },
    update: (text: string) => bridge.textContainerUpgrade(new TextContainerUpgrade({ ...MAIN, content: text })),
    onEvent: (listener) => bridge.onEvenHubEvent(listener),
    async getItem(key: string) {
      return (await bridge.getLocalStorage(key)) || null
    },
    async setItem(key: string, value: string) {
      await bridge.setLocalStorage(key, value)
    },
    async exit() {
      await bridge.shutDownPageContainer(1)
    },
  }
}
