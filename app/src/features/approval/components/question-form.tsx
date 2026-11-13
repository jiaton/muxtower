import { Check, Circle, CircleCheck, Square, SquareCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PendingQuestion } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { textRole } from '@/components/ui/styles'

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
            {q.header ? <span className={textRole.eyebrow}>{q.header}</span> : null}
            <span className="font-medium">{q.question}</span>
            {q.multi_select ? <span className={textRole.meta}>Pick any</span> : null}
          </legend>
          {q.options.map((option) => {
            const on = picked[index].includes(option.label)
            const Icon = q.multi_select ? (on ? SquareCheck : Square) : on ? CircleCheck : Circle
            return (
              <button
                key={option.label}
                type="button"
                role={q.multi_select ? 'checkbox' : 'radio'}
                aria-checked={on}
                disabled={busy}
                onClick={() => pick(index, option.label, q.multi_select ?? false)}
                className={cn(
                  'flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm',
                  on ? 'border-accent bg-surface-muted' : 'border-border hover:bg-surface-muted',
                )}
              >
                <Icon className={cn('mt-0.5 size-4 shrink-0', on ? 'text-accent' : 'text-fg-muted')} aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span>{option.label}</span>
                  {option.description && option.description !== option.label ? (
                    <span className={textRole.meta}>{option.description}</span>
                  ) : null}
                </span>
              </button>
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
