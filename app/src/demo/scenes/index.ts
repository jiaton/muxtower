import type { Scene } from '../world'
import { docs } from './docs'
import { archived, migrations } from './interrupted'
import { changelogFork, infra, releaseNotes, releaseNotesFork, releasePostFork, tidyUp } from './others'
import { shopApi } from './shop-api'
import { webApp } from './web-app'

/** Every session of the demo, fresh: a reader's actions change only this copy. */
export const scenes = (): Scene[] => [
  shopApi(),
  webApp(),
  docs(),
  infra(),
  releaseNotes(),
  releaseNotesFork(),
  changelogFork(),
  releasePostFork(),
  tidyUp(),
  migrations(),
  ...archived(),
]
