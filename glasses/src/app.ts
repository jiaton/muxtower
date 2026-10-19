/** The controller: hub link → store → screens → renderer, and glasses input → screens → commands. */
import { Renderer } from '@/display/renderer'
import type { Screen } from '@/display/screen'
import { wrap } from '@/display/text'
import { TEXT_WIDTH } from '@/display/limits'
import { createHubClient, unwrap, type HubClient } from '@/hub/client'
import type { HubConfig } from '@/hub/config'
import { claim } from '@/hub/pairing'
import { HubStream, type LinkState } from '@/hub/stream'
import type { Session } from '@/hub/types'
import { readEvent, toAction, DEFAULT_GESTURES, type GestureMap, type Input } from '@/input/gestures'
import type { GlassesPort } from '@/platform/port'
import { MENU, act, menuAct, view } from '@/screens'
import { launchNav } from '@/state/launch'
import type { Outcome } from '@/state/model'
import { loadSaved, saveNav, saveToken } from '@/state/persist'
import type { AppStore } from '@/state/store'
import { runCommand } from './commands'

const AGE_TICK_MS = 30_000
const POLL_MS = 10_000
const NOTICE_MS = 5000

export class GlassesApp {
  readonly renderer: Renderer
  private readonly port: GlassesPort
  private readonly config: HubConfig
  private readonly store: AppStore
  private client: HubClient
  private stream: HubStream | null = null
  private gestures: GestureMap = DEFAULT_GESTURES
  private noticeTimer: ReturnType<typeof setTimeout> | null = null
  private onDraw: (text: string) => void = () => undefined

  constructor(port: GlassesPort, config: HubConfig, store: AppStore) {
    this.port = port
    this.config = config
    this.store = store
    this.renderer = new Renderer(port, MENU)
    this.client = createHubClient(config, null)
  }

  get hubUrl() {
    return this.config.url
  }

  /** The phone panel mirrors what the glasses show. */
  mirror(listener: (text: string) => void) {
    this.onDraw = listener
  }

  async start() {
    const saved = await loadSaved(this.port)
    this.gestures = saved.gestures
    const { nav } = this.store.getState()
    this.store.setState({ nav: { ...nav, cursors: saved.cursors, lastOpened: saved.lastOpened } })
    this.port.onEvent((event) => this.input(readEvent(event)))
    this.store.subscribe(() => void this.render())
    setInterval(() => void this.render(), AGE_TICK_MS)
    setInterval(() => void this.poll(), POLL_MS)
    const token = saved.token ?? (__DEV_TOKEN__ || null)
    if (token) this.connect(token)
    else await this.render()
  }

  async pair(code: string, deviceName?: string) {
    const result = await claim(createHubClient(this.config, null), code, deviceName)
    await saveToken(this.port, result.token)
    this.store.setState({ hubName: result.daemon_name })
    this.connect(result.token)
  }

  async unpair() {
    this.stream?.stop()
    this.stream = null
    await saveToken(this.port, null)
    this.store.setState({ link: 'unpaired', sessions: [], loaded: false })
  }

  private connect(token: string) {
    this.client = createHubClient(this.config, token)
    this.stream?.stop()
    this.store.setState({ link: 'connecting' })
    void this.client.GET('/v1/me').then(
      (result) => {
        if (result.data) this.store.setState({ hubName: result.data.daemon_name })
      },
      () => undefined,
    )
    this.stream = new HubStream(this.config, token, {
      frame: (frame) => {
        if (frame.type === 'sessions') this.applySessions(frame.sessions)
      },
      state: (link: LinkState) => this.store.setState({ link }),
    })
    this.stream.subscribe({ type: 'subscribe', topic: 'sessions', history: 0 })
    this.stream.start()
  }

  /** While the stream is down, the list is polled. */
  private async poll() {
    const { link } = this.store.getState()
    if (link !== 'down') return
    try {
      this.applySessions(unwrap(await this.client.GET('/v1/sessions')))
    } catch {
      // Still down; the stream keeps retrying.
    }
  }

  private applySessions(sessions: Session[]) {
    const state = this.store.getState()
    const before = new Set(state.sessions.filter((s) => s.needs_attention).map((s) => s.id))
    const newly = sessions.filter((s) => s.needs_attention && !before.has(s.id))
    if (!state.loaded) {
      this.store.setState({ sessions, loaded: true, nav: launchNav(state.nav, sessions, state.hubName) })
      return
    }
    this.store.setState({ sessions })
    if (newly.length) this.notify(`! ${newly[0].name} needs you`)
  }

  private notify(notice: string | null) {
    this.store.setState({ notice })
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.noticeTimer = setTimeout(() => {
      if (this.store.getState().notice === notice) this.store.setState({ notice: null })
    }, NOTICE_MS)
  }

  private input(input: Input | null) {
    if (!input) return
    const state = this.store.getState()
    if ('lifecycle' in input) {
      if (input.lifecycle === 'uncovered') {
        this.stream?.kick()
        void this.render()
      }
      return
    }
    if (state.link === 'unpaired' || state.link === 'rejected') return
    if ('menu' in input) return this.apply(menuAct(state, input.menu))
    const action = toAction(input.gesture, this.gestures)
    if (action === 'talk') return this.notify('Voice replies are not ready yet')
    if (action && action !== 'talkEnd') this.apply(act(state, action, Date.now()))
  }

  private apply(outcome: Outcome) {
    const patch = outcome.notice === undefined ? { nav: outcome.nav } : { nav: outcome.nav, notice: outcome.notice }
    this.store.setState(patch)
    void saveNav(this.port, outcome.nav)
    if (!outcome.command) return
    void runCommand(this.client, outcome.command, {
      sessions: (list) => this.applySessions(list),
      reconnect: () => this.stream?.kick(),
      exit: () => this.port.exit(),
      rejected: () => this.store.setState({ link: 'rejected' }),
    }).then((notice) => notice && this.notify(notice))
  }

  private async render() {
    const state = this.store.getState()
    let screen: Screen
    if (state.link === 'unpaired' || state.link === 'rejected') {
      screen = pairingScreen(state.link === 'rejected')
    } else {
      const drawn = view(state, Date.now())
      if (drawn.order && state.nav.frozen === null) {
        this.store.setState({ nav: { ...state.nav, frozen: drawn.order } })
        return // the store change renders again
      }
      screen = drawn.screen
    }
    await this.renderer.show(screen)
    if (this.renderer.current) this.onDraw(this.renderer.current)
  }
}

function pairingScreen(revoked: boolean): Screen {
  const lead = revoked ? 'This device was unpaired.' : 'Not paired yet.'
  const how = 'On your phone, open muxtower in the Even App and enter a pairing code from `muxtower pair` or the web app.'
  return { header: 'muxtower', body: [lead, '', ...wrap(how, TEXT_WIDTH)], footer: 'waiting for a code…' }
}
