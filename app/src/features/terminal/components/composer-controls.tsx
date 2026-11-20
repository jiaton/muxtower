import { CornerDownLeft, FilePlus, ImagePlus, Paperclip, SendHorizontal } from 'lucide-react'
import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { FilePicker } from '@/components/ui/file-picker'
import { keepFocus } from '@/components/ui/gesture'
import { Spinner } from '@/components/ui/indicators'
import { cn } from '@/lib/cn'

/** The composer's two unseen pickers (`any`: every file; `pictures`: a phone's own picture choices, camera
 *  and photos) and, off a phone, its one button that opens the first. */
export function AttachPickers({
  any,
  pictures,
  narrow,
  onPicked,
}: {
  any: RefObject<HTMLInputElement | null>
  pictures: RefObject<HTMLInputElement | null>
  narrow: boolean
  onPicked: (files: FileList | null) => void
}) {
  return (
    <>
      {[any, pictures].map((ref) => (
        <FilePicker
          key={ref === any ? 'any' : 'pictures'}
          ref={ref}
          accept={ref === any ? undefined : 'image/*'}
          multiple
          onChange={(e) => {
            onPicked(e.target.files)
            e.target.value = ''
          }}
        />
      ))}
      <Button
        variant="ghost"
        size="icon"
        className={cn('shrink-0', narrow && 'hidden')}
        aria-label="Add pictures or files"
        title="Add pictures or files (or paste or drop them in the box)"
        onPointerDown={keepFocus}
        onClick={() => any.current?.click()}
      >
        <Paperclip />
      </Button>
    </>
  )
}

/** A phone's attach choices, in the + panel beside the keys: pictures (where the session takes them) as the
 *  phone offers them, and any file. */
export function PanelAttach({ any, pictures }: { any: RefObject<HTMLInputElement | null>; pictures?: RefObject<HTMLInputElement | null> }) {
  return (
    <div className="flex gap-2">
      {pictures ? (
        <Button variant="secondary" size="sm" onPointerDown={keepFocus} onClick={() => pictures.current?.click()}>
          <ImagePlus /> Add pictures
        </Button>
      ) : null}
      <Button variant="secondary" size="sm" onPointerDown={keepFocus} onClick={() => any.current?.click()}>
        <FilePlus /> Add files
      </Button>
    </div>
  )
}

/** Send: the agent's suggestion (`offered`) on an empty box; "Uploading…" while files are on their way
 *  (pressed, the message goes once they are up: `waiting`), on a phone (`narrow`) its spinner alone, so the
 *  message box keeps its width. */
export function SendButton({
  offered,
  uploading,
  waiting,
  disabled,
  narrow = false,
}: {
  offered: string | null
  uploading: boolean
  waiting: boolean
  disabled: boolean
  narrow?: boolean
}) {
  if (uploading && !offered)
    return (
      <Button
        type="submit"
        size={narrow ? 'icon' : 'md'}
        className="shrink-0"
        aria-label={waiting ? 'Uploading…, sends when done' : 'Uploading…'}
        title="Sends once the files are uploaded"
        aria-pressed={waiting}
      >
        <Spinner />
        {narrow ? null : 'Uploading…'}
      </Button>
    )
  return (
    <Button
      type="submit"
      size="icon"
      className="shrink-0"
      aria-label={offered ? `Send suggestion: ${offered}` : 'Send'}
      title={offered ? `Send suggestion: ${offered}` : undefined}
      disabled={disabled}
    >
      {offered ? <CornerDownLeft /> : <SendHorizontal />}
    </Button>
  )
}
