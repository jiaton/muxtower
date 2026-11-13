import { Check, Circle, CircleCheck, Square, SquareCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PendingQuestion } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { ink } from '@/components/ui/intents'

/** Whether a prompt's questions need a form: more than one, or one taking several answers. A single
 *  choice is one tap on its option instead. */
export const needsForm = (questions: PendingQuestion[] | undefined) =>
  !!questions && (questions.length > 1 || questions.some((q) => q.multi_select))

/** All of a multiple-choice prompt's questions, answered together: one pick each, or any number where a
 *  question takes several; Submit once every question has one. */
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
  const pick = (index: number, label: string, multi: boolean) =>
    setPicked((all) =>
      all.map((labels, i) =>
        i !== index ? labels : multi ? (labels.includes(label) ? labels.filter((l) => l !== label) : [...labels, label]) : [label],
      ),
    )
  const complete = picked.every((labels) => labels.length > 0)

  return (
    <div className="flex flex-col gap-4">
      {questions.map((q, index) => (
        <fieldset key={`${index}-${q.question}`} className="flex flex-col gap-2">
          <legend className="mb-1 flex flex-col gap-0.5">
            {q.header ? <span className={ink.eyebrow}>{q.header}</span> : null}
            <span className={ink.strong}>{q.question}</span>
            {q.multi_select ? <span className={ink.meta}>Pick any</span> : null}
          </legend>
          {q.options.map((option) => {
            const on = picked[index].includes(option.label)
            const Icon = q.multi_select ? (on ? SquareCheck : Square) : on ? CircleCheck : Circle
            return (
              <Button
                key={option.label}
                variant="option"
                size={null}
                role={q.multi_select ? 'checkbox' : 'radio'}
                aria-checked={on}
                disabled={busy}
                onClick={() => pick(index, option.label, q.multi_select ?? false)}
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
        </fieldset>
      ))}
      <Button variant="approve" className="self-start" disabled={busy || !complete} onClick={() => onSubmit(picked)}>
        <Check /> Submit answers
      </Button>
    </div>
  )
}
