import { Check, Circle, CircleCheck, Square, SquareCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PendingQuestion } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { ink, look } from '@/components/ui/intents'

/** Whether a prompt's questions need a form: more than one, or one taking several answers. A single
 *  choice is one tap on its option instead. */
export const needsForm = (questions: PendingQuestion[] | undefined) =>
  !!questions && (questions.length > 1 || questions.some((q) => q.multi_select))

/** All of a multiple-choice prompt's questions, from what the agent asked (its hook), never from the screen:
 *  one pick each, or any number where a question takes several; Submit once every question has one. A
 *  single choice (one question, one answer) needs no Submit: a tap on an option answers it. Options with a
 *  mockup (`preview`) show the one pointed at or focused (else the picked one, else the first) beside the
 *  list where there is room, under it on a phone, as the agent's terminal does. */
export function QuestionForm({
  questions,
  busy,
  onSubmit,
}: {
  questions: PendingQuestion[]
  busy: boolean
  onSubmit: (answers: string[][]) => void
}) {
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []))
  const [pointed, setPointed] = useState<(number | null)[]>(() => questions.map(() => null))
  const single = !needsForm(questions)
  const pick = (index: number, label: string, multi: boolean) => {
    if (single) return onSubmit([[label]])
    setPicked((all) =>
      all.map((labels, i) =>
        i !== index ? labels : multi ? (labels.includes(label) ? labels.filter((l) => l !== label) : [...labels, label]) : [label],
      ),
    )
  }
  const point = (index: number, option: number | null) => setPointed((all) => all.map((p, i) => (i === index ? option : p)))
  const complete = picked.every((labels) => labels.length > 0)

  return (
    <div className="flex flex-col gap-4">
      {questions.map((q, index) => {
        const previews = q.options.some((o) => o.preview)
        const chosen = q.options.findIndex((o) => picked[index]!.includes(o.label))
        const shown = q.options[pointed[index] ?? (chosen >= 0 ? chosen : 0)]?.preview
        return (
          <fieldset key={`${index}-${q.question}`} className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1 flex flex-col gap-0.5">
              {q.header ? <span className={ink.eyebrow}>{q.header}</span> : null}
              <span className={ink.strong}>{q.question}</span>
              {q.multi_select ? <span className={ink.meta}>Pick any</span> : null}
            </legend>
            <div className={cn('flex flex-col gap-3', previews && '@container')}>
              <div className={cn('grid gap-3', previews && '@xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
                <div className="flex min-w-0 flex-col gap-2" onMouseLeave={() => point(index, null)}>
                  {q.options.map((option, n) => {
                    const on = picked[index]!.includes(option.label)
                    const Icon = q.multi_select ? (on ? SquareCheck : Square) : on ? CircleCheck : Circle
                    return (
                      <Button
                        key={option.label}
                        variant="option"
                        size={null}
                        role={single ? undefined : q.multi_select ? 'checkbox' : 'radio'}
                        aria-checked={single ? undefined : on}
                        disabled={busy}
                        onClick={() => pick(index, option.label, q.multi_select ?? false)}
                        onMouseEnter={() => point(index, n)}
                        onFocus={() => point(index, n)}
                        className="items-start"
                      >
                        <Icon className={cn('mt-0.5 size-4 shrink-0', on ? ink.accent : ink.quiet)} aria-hidden />
                        <span className="flex min-w-0 flex-col">
                          <span>{option.label}</span>
                          {option.description && option.description !== option.label ? (
                            <span className={ink.meta}>{option.description}</span>
                          ) : null}
                        </span>
                      </Button>
                    )
                  })}
                </div>
                {previews ? (
                  shown ? (
                    <pre className={`${look.mockup} self-start px-3 py-2`} aria-label="Preview">
                      {shown}
                    </pre>
                  ) : (
                    <p className={ink.meta}>No preview for this option</p>
                  )
                ) : null}
              </div>
            </div>
          </fieldset>
        )
      })}
      {single ? null : (
        <Button variant="approve" className="self-start" disabled={busy || !complete} onClick={() => onSubmit(picked)}>
          <Check /> Submit answers
        </Button>
      )}
    </div>
  )
}
