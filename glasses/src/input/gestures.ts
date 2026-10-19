/** Raw Even Hub events → gestures → actions. Which gesture does what is data (`GestureMap`), so the
 *  owner can remap it; screens only ever see actions. */
import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'

export type Gesture = 'up' | 'down' | 'tap' | 'double' | 'long' | 'longEnd'
/** `covered`: a system layer (the menu, a notification) is over the app; `uncovered`: it is gone. */
export type Lifecycle = 'covered' | 'uncovered' | 'exit'
export type Input = { gesture: Gesture } | { menu: number } | { lifecycle: Lifecycle }

/** What a screen can be asked to do. `talk`/`talkEnd` hold to talk (voice replies). */
export type Action = 'up' | 'down' | 'select' | 'back' | 'talk' | 'talkEnd'
export type GestureMap = Record<Gesture, Action | null>

export const DEFAULT_GESTURES: GestureMap = {
  up: 'up',
  down: 'down',
  tap: 'select',
  double: 'back',
  long: 'talk',
  longEnd: 'talkEnd',
}

const GESTURES: Partial<Record<OsEventTypeList, Gesture>> = {
  [OsEventTypeList.CLICK_EVENT]: 'tap',
  [OsEventTypeList.SCROLL_TOP_EVENT]: 'up',
  [OsEventTypeList.SCROLL_BOTTOM_EVENT]: 'down',
  [OsEventTypeList.DOUBLE_CLICK_EVENT]: 'double',
  [OsEventTypeList.LONG_PRESS_EVENT]: 'long',
  [OsEventTypeList.LONG_PRESS_RELEASE_EVENT]: 'longEnd',
}

const LIFECYCLE: Partial<Record<OsEventTypeList, Lifecycle>> = {
  [OsEventTypeList.FOREGROUND_ENTER_EVENT]: 'covered',
  [OsEventTypeList.FOREGROUND_EXIT_EVENT]: 'uncovered',
  [OsEventTypeList.ABNORMAL_EXIT_EVENT]: 'exit',
  [OsEventTypeList.SYSTEM_EXIT_EVENT]: 'exit',
}

export function readEvent(event: EvenHubEvent): Input | null {
  if (event.menuItemClickEvent?.itemID !== undefined) return { menu: event.menuItemClickEvent.itemID }
  const item = event.textEvent ?? event.listEvent ?? event.sysEvent
  if (!item) return null
  if (event.sysEvent?.imuData) return null
  // A tap is event type 0, which the protobuf encoding leaves out: no type means a tap.
  const type = OsEventTypeList.fromJson(item.eventType) ?? OsEventTypeList.CLICK_EVENT
  const gesture = GESTURES[type]
  if (gesture) return { gesture }
  const lifecycle = LIFECYCLE[type]
  return lifecycle ? { lifecycle } : null
}

export const toAction = (gesture: Gesture, map: GestureMap = DEFAULT_GESTURES) => map[gesture]
