import type { ConversationItem, Session, TeamTask } from '@/lib/api/types'
import { draftBox } from '@/features/terminal/draft-box'
import { useLive } from '@/features/voice/live/engine'
import type { Heard } from '@/features/voice/live/pipeline'
import { useDaemonsStore } from '@/lib/daemons/store'
import { scenes } from './scenes'
import { DEMO_DAEMON, NODE, demoSession } from './scenes/session'
import { respond } from './server'
import { DemoSocket } from './socket'
import { type Step, World } from './world'

/** Where the demo's second computer answers itself (direct fallback, `?hub=down`). */
export const DIRECT_URL = 'https://laptop.demo.invalid'

/**
 * Points the app at the simulated daemon: requests and the stream socket for its address are answered
 * in this page (everything else goes out as usual), and it is the one paired daemon. The app itself is
 * unchanged: this sits where the network would be, as the tests' MSW handlers do. With `?hub=down` the
 * hub's machine is restarting, and the laptop answers at its own address, as a hub's node does then.
 */
export function installDemo() {
  // The clip recorder can hold the demo's own story (its scenes' timed steps), so that only it moves things.
  let held = false
  const world = new World(scenes(), (run, ms) => void setTimeout(() => held || run(), ms))
  const origin = new URL(DEMO_DAEMON.url).origin
  const at = (url: string, place: string) => new URL(url).origin.replace(/^ws/, 'http') === place
  const hubDown = new URLSearchParams(location.search).get('hub') === 'down'

  const fetchOut = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (input, init) => {
    const request = new Request(input, init)
    if (at(request.url, origin)) return hubDown ? Promise.reject(new TypeError('Failed to fetch')) : respond(world, request)
    if (at(request.url, DIRECT_URL)) return respondAsNode(world, request)
    return fetchOut(input, init)
  }

  const SocketOut = globalThis.WebSocket
  function DemoWebSocket(url: string | URL, protocols?: string | string[]) {
    const to = String(url)
    if ((at(to, origin) && hubDown) || at(to, DIRECT_URL)) return new SocketOut('wss://nowhere.invalid') // polled instead
    return at(to, origin) ? new DemoSocket(world) : new SocketOut(url, protocols)
  }
  Object.assign(DemoWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
  globalThis.WebSocket = DemoWebSocket as unknown as typeof WebSocket

  // The site's clip recorder (site/clips) scripts the story through this; only with `?clip` in the URL.
  if (new URLSearchParams(location.search).has('clip')) {
    Object.assign(window, {
      muxtowerClip: {
        hold: () => void (held = true),
        // Its own cast: sessions added (a demo session with these fields) and the demo's own removed.
        add: (fields: Parameters<typeof demoSession>[0], tasks?: TeamTask[]) =>
          world.add({ session: demoSession(fields), history: [], footer: [], items: [], tasks }),
        remove: (id: string) => world.remove(id),
        // A change that keeps the session's place in the list (its time stays): rows that stay put.
        mark: (id: string, patch: Partial<Session>) => world.mark(id, patch),
        play: (id: string, steps: Step[]) => world.play(id, steps),
        setItems: (id: string, items: ConversationItem[]) => world.setItems(id, items),
        setReply: (id: string, steps: Step[]) => world.setReply(id, steps),
        sessions: () => world.sessions(),
        // Live mode as the recorder tells it: what it is doing, and what it heard (no microphone, no ASR).
        live: (state: Partial<ReturnType<typeof useLive.getState>>) => useLive.setState(state),
        heard: (event: Heard) => useLive.setState({ heard: { event, at: Date.now() } }),
        land: (sessionId: string, text: string) => draftBox.append({ daemonId: DEMO_DAEMON.id, sessionId }, text),
        send: (sessionId: string) => draftBox.send({ daemonId: DEMO_DAEMON.id, sessionId }),
      },
    })
  }

  const laptop = { id: `${DEMO_DAEMON.id}~${NODE}`, name: NODE, url: DIRECT_URL, token: 'demo-direct', via: DEMO_DAEMON.id, node: NODE }
  useDaemonsStore.setState({ daemons: [{ ...DEMO_DAEMON, streamAuth: 'subprotocol' }, ...(hubDown ? [laptop] : [])] })
}

type Listed = { id: string; node?: string | null }

/** The laptop as it answers at its own address: its own sessions, under its own ids. */
async function respondAsNode(world: World, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const prefix = `${NODE}~`
  const path = url.pathname.replace(/^\/v1\/sessions\/([^/]+)/, (_, id: string) => `/v1/sessions/${prefix}${id}`)
  const body = request.method === 'GET' ? undefined : await request.text()
  const asHub = new Request(new URL(path + url.search, DEMO_DAEMON.url), { method: request.method, headers: request.headers, body })
  const answer = await respond(world, asHub)
  if (url.pathname !== '/v1/sessions' && !/^\/v1\/sessions\/[^/]+$/.test(url.pathname)) return answer
  const own = (s: Listed) => ({ ...s, id: s.id.replace(prefix, ''), node: null })
  const data = (await answer.json()) as Listed | Listed[]
  const listed = Array.isArray(data) ? data.filter((s) => s.node === NODE).map(own) : own(data)
  return new Response(JSON.stringify(listed), { status: answer.status, headers: { 'Content-Type': 'application/json' } })
}
