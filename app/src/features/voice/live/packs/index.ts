import { en } from './en'
import type { CommandPack } from './types'
import { zh } from './zh'

export type { CommandPack } from './types'

/** Every language Live mode takes commands in (a new one: a file here, and a line below). */
export const PACKS: CommandPack[] = [en, zh]

export type Language = string

export const packOf = (id: string) => PACKS.find((p) => p.id === id)

// --- the languages chosen, per browser (English by default) ---------------------------------------------

const LANGUAGES_KEY = 'muxtower.live.languages'

export function chosenLanguages(): Language[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LANGUAGES_KEY) ?? 'null') as Language[] | null
    const valid = saved?.filter((l) => packOf(l)) ?? []
    return valid.length ? valid : ['en']
  } catch {
    return ['en']
  }
}

export function chooseLanguages(languages: Language[]) {
  try {
    localStorage.setItem(LANGUAGES_KEY, JSON.stringify(languages.length ? languages : ['en']))
  } catch {
    // storage blocked: English, as by default
  }
}

/** The packs of the languages chosen. */
export const enabledPacks = (): CommandPack[] => chosenLanguages().map((l) => packOf(l)!)
