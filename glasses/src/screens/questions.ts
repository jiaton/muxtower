/** A multiple-choice prompt (Claude Code's AskUserQuestion) on the glasses: one question at a time, its
 *  answers kept in a draft and sent together once the last one is answered. A single-choice question
 *  takes two taps (choose, confirm); on a multi-choice one a tap ticks an option and "Done" confirms. */
import { TEXT_WIDTH } from '@/display/limits'
import { fit, width, wrap } from '@/display/text'
import type { PendingQuestion, Session } from '@/hub/types'
import type { Draft } from '@/state/model'

const QUESTION_LINES = 3
const MARK = width('> ')
export const DONE = 'done'
const TICKED = '[x] '
const UNTICKED = '[ ] '

export interface Choice {
  key: string
  label: string
  line: number
}

/** Which questions a draft belongs to: their wording and options. */
export const askedOf = (questions: PendingQuestion[]) =>
  JSON.stringify(questions.map((q) => [q.question, q.options.map((o) => o.label)]))

/** The session's questions, while it is waiting on them. */
export const questionsOf = (session: Session): PendingQuestion[] =>
  session.needs_attention ? (session.pending?.questions ?? []) : []

/** The draft for these questions, or a fresh one (another session's, or older questions', is dropped). */
export function draftFor(session: Session, draft: Draft | null): Draft {
  const asked = askedOf(questionsOf(session))
  return draft && draft.session === session.id && draft.asked === asked
    ? draft
    : { session: session.id, asked, picked: [], ticked: [] }
}

const optionKey = (index: number) => `q:${index}`
export const optionIndex = (key: string) => (key.startsWith('q:') ? Number(key.slice(2)) : -1)

/** The question at hand, as lines with its options as choices (starting at line `from`). */
export function questionLayout(questions: PendingQuestion[], draft: Draft, from: number) {
  const index = Math.min(draft.picked.length, questions.length - 1)
  const question = questions[index]
  const lines: string[] = []
  const choices: Choice[] = []
  const head = [`${index + 1}/${questions.length}`, question.header].filter(Boolean).join(' · ')
  const asked = wrap(`${head}  ${question.question}`, TEXT_WIDTH)
  lines.push(...asked.slice(0, QUESTION_LINES))
  if (asked.length > QUESTION_LINES) lines[QUESTION_LINES - 1] = fit(`${lines[QUESTION_LINES - 1]} …`, TEXT_WIDTH)
  question.options.forEach((option, i) => {
    const tick = question.multi_select ? (draft.ticked.includes(option.label) ? TICKED : UNTICKED) : ''
    choices.push({ key: optionKey(i), label: option.label, line: from + lines.length })
    lines.push(fit(`${tick}${option.label}`, TEXT_WIDTH - MARK))
  })
  if (question.multi_select) {
    const label = index === questions.length - 1 ? 'Done: send' : 'Done: next question'
    choices.push({ key: DONE, label, line: from + lines.length })
    lines.push(label)
  }
  return { lines, choices, question, index }
}

export type Answered =
  | { draft: Draft; send?: undefined } // the next question, or a tick changed
  | { draft: null; send: string[][] } // the last question answered: send them all

/** A confirmed choice on the question at hand: tick (multi-choice), or record the answer and go on. */
export function answer(questions: PendingQuestion[], draft: Draft, key: string): Answered {
  const { question } = questionLayout(questions, draft, 0)
  const option = question.options[optionIndex(key)]
  if (question.multi_select && option) {
    const ticked = draft.ticked.includes(option.label)
      ? draft.ticked.filter((label) => label !== option.label)
      : [...draft.ticked, option.label]
    return { draft: { ...draft, ticked } }
  }
  const picked = [...draft.picked, question.multi_select ? draft.ticked : option ? [option.label] : []]
  if (picked.length >= questions.length) return { draft: null, send: picked }
  return { draft: { ...draft, picked, ticked: [] } }
}

/** Whether a choice confirms at once (ticking an option) or takes the usual second tap. */
export const oneTap = (questions: PendingQuestion[], draft: Draft, key: string) =>
  key !== DONE && !!questionLayout(questions, draft, 0).question.multi_select
