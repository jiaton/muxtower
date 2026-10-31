import { useDaemonsStore } from '@/lib/daemons/store'
import { scenes } from './scenes'
import { DEMO_DAEMON } from './scenes/session'
import { respond } from './server'
import { DemoSocket } from './socket'
import { World } from './world'

/**
 * Points the app at the simulated daemon: requests and the stream socket for its address are answered
 * in this page (everything else goes out as usual), and it is the one paired daemon. The app itself is
 * unchanged: this sits where the network would be, as the tests' MSW handlers do.
 */
export function installDemo() {
  const world = new World(scenes())
  const origin = new URL(DEMO_DAEMON.url).origin
  const ours = (url: string) => new URL(url).origin.replace(/^ws/, 'http') === origin

  const fetchOut = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (input, init) => {
    const request = new Request(input, init)
    return ours(request.url) ? respond(world, request) : fetchOut(input, init)
  }

  const SocketOut = globalThis.WebSocket
  function DemoWebSocket(url: string | URL, protocols?: string | string[]) {
    return ours(String(url)) ? new DemoSocket(world) : new SocketOut(url, protocols)
  }
  Object.assign(DemoWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
  globalThis.WebSocket = DemoWebSocket as unknown as typeof WebSocket

  useDaemonsStore.setState({ daemons: [{ ...DEMO_DAEMON, streamAuth: 'subprotocol' }] })
}
