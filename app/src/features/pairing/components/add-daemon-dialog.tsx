import { Camera, Link2, KeyRound } from 'lucide-react'
import { type ReactNode, useCallback, useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { parsePairLink, type PairTarget } from '../pair-link'
import { PairClaim } from './pair-claim'
import { QrScanner } from './qr-scanner'

type Mode = 'scan' | 'link' | 'code'

/** Add a daemon by scanning a pairing QR, pasting a pairing link, or typing a daemon URL + one-time code. */
export function AddDaemonDialog({
  open,
  onOpenChange,
  initialUrl,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialUrl?: string
}) {
  const [mode, setMode] = useState<Mode>(initialUrl ? 'code' : 'scan')
  const [targets, setTargets] = useState<PairTarget[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [url, setUrl] = useState(initialUrl ?? '')
  const [code, setCode] = useState('')

  const accept = useCallback((text: string) => {
    const found = parsePairLink(text)
    if (found.length) {
      setTargets(found)
      setProblem(null)
    } else setProblem('That is not a muxtower pairing link.')
  }, [])

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setTargets(null)
      setProblem(null)
    }
  }

  const tab = (value: Mode, icon: ReactNode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm [&_svg]:size-4',
        mode === value ? 'bg-surface text-fg shadow-card' : 'text-fg-muted',
      )}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title="Add a daemon" description="Use the code from `muxtower pair`, or a link from another device.">
        {targets ? (
          <PairClaim targets={targets} onDone={() => close(false)} />
        ) : (
          <>
            <div role="tablist" className="flex gap-1 rounded-md bg-surface-muted p-1">
              {tab('scan', <Camera />, 'Scan')}
              {tab('link', <Link2 />, 'Link')}
              {tab('code', <KeyRound />, 'Code')}
            </div>
            {problem ? <Banner tone="warning">{problem}</Banner> : null}
            {mode === 'scan' ? <QrScanner onResult={accept} /> : null}
            {mode === 'link' ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  accept(link)
                }}
              >
                <Input placeholder="https://…/pair#…" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Pairing link" />
                <Button type="submit">Continue</Button>
              </form>
            ) : null}
            {mode === 'code' ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  setTargets([{ url: url.trim(), code: code.trim() }])
                }}
              >
                <Input type="text" inputMode="url" autoCapitalize="off" spellCheck={false} required placeholder="https://daemon.example" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Daemon URL" />
                <Input
                  required
                  placeholder="K7QM-3XPA"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-label="Pairing code"
                  className="font-mono tracking-widest"
                />
                <Button type="submit">Continue</Button>
              </form>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
