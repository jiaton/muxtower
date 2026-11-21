import type { Scene } from '../world'
import { docs } from './docs'
import { archived, migrations } from './interrupted'
import { changelogFork, infra, releaseNotes, releaseNotesFork, releasePostFork, shopApiLaptop, tidyUp } from './others'
import { moreProjects } from './projects'
import { shopApi } from './shop-api'
import { TEAM_TASKS, team } from './team'
import { webApp } from './web-app'

/** Every session of the demo, fresh: a reader's actions change only this copy. */
export const scenes = (): Scene[] =>
  withTasks([
    shopApi(),
    webApp(),
    docs(),
    infra(),
    releaseNotes(),
    releaseNotesFork(),
    changelogFork(),
    releasePostFork(),
    tidyUp(),
    shopApiLaptop(),
    migrations(),
    ...team(),
    ...moreProjects(),
    ...archived(),
  ])

/** Gives each scene the team's tasks it sent or was sent, with its own, newest first (as the hub lists them). */
function withTasks(all: Scene[]): Scene[] {
  return all.map((scene) => {
    const id = scene.session.id
    const mine = TEAM_TASKS.filter((t) => t.to_id === id || t.from_id === id)
    if (!mine.length && !scene.tasks) return scene
    return { ...scene, tasks: [...(scene.tasks ?? []), ...mine].sort((a, b) => b.at.localeCompare(a.at)) }
  })
}
