import { en } from './en'
import type { CommandPack } from './types'
import { zh } from './zh'

export type { CommandPack } from './types'

/** Every language Live mode takes commands in (a new one: a file here, and a line below). */
export const PACKS: CommandPack[] = [en, zh]

export type Language = string

export const packOf = (id: string) => PACKS.find((p) => p.id === id)

/** Read aloud's words in a language (a tag: zh, en, zh-CN…): its pack's, else English's. */
export const spokenIn = (language: string | null | undefined) => (packOf((language ?? '').split('-')[0]!.toLowerCase()) ?? en).spoken

/** A text's language as a tag, by its script (as the hub tells it, `listen/language.py`): ko, ja, zh, en. */
export function languageOf(text: string): string {
  const letters = text.match(/\p{L}/gu)?.length || 1
  const count = (re: RegExp) => text.match(re)?.length ?? 0
  const han = count(/[\u3400-\u4dbf\u4e00-\u9fff]/g)
  const kana = count(/[\u3040-\u30ff]/g)
  if (count(/[\uac00-\ud7af]/g) / letters > 0.2) return 'ko'
  if (kana && (kana + han) / letters > 0.2) return 'ja'
  if (han / letters > 0.2) return 'zh'
  return 'en'
}

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
