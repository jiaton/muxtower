import type { Scene } from '../world'
import { docs } from './docs'
import { infra, releaseNotes } from './others'
import { shopApi } from './shop-api'
import { webApp } from './web-app'

/** Every session of the demo, fresh: a reader's actions change only this copy. */
export const scenes = (): Scene[] => [shopApi(), webApp(), docs(), infra(), releaseNotes()]
