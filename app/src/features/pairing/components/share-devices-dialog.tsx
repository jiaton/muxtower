import { Copy, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { useShareCodes } from '../api/use-pairing'
import { buildPairLink } from '../pair-link'
import { QrImage } from './qr-image'
import { box, text, textRole } from '@/components/ui/styles'

const appBase = () => new URL(import.meta.env.BASE_URL, location.origin).toString()

/** Shows one QR that pairs another device with every daemon this one has. The QR carries one-time
 *  codes, never tokens: each new device gets its own token, and a photographed QR expires. */
export function ShareDevicesDialog() {
  const share = useShareCodes()
  const [copied, setCopied] = useState(false)
  const codes = share.data
  const link = codes?.length ? buildPairLink(appBase(), codes) : null

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) share.mutate()
        else {
          share.reset()
          setCopied(false)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Smartphone /> Add another device
        </Button>
      </DialogTrigger>
      <DialogContent title="Add another device" description="Scan this with the other device's camera, or with Add a daemon › Scan.">
        {share.isPending ? <div className={`${box({ radius: 'md', ground: 'muted' })} mx-auto aspect-square w-full max-w-72`} /> : null}
        {share.isError ? <Banner tone="error">{share.error.message}</Banner> : null}
        {codes && !codes.length ? <Banner tone="warning">No paired daemon answered.</Banner> : null}
        {link ? (
          <>
            <QrImage text={link} label="Pairing QR code" />
            <p className={`${textRole.hint} text-center`}>
              Pairs {codes!.length} daemon{codes!.length > 1 ? 's' : ''}. Works once, for 5 minutes.
            </p>
            {/* For a device that cannot scan (glasses paired from the same phone): the codes to type. */}
            <ul aria-label="Pairing codes" className={`${text({ size: 'sm' })} flex flex-col gap-1 text-center`}>
              {codes!.map((c) => (
                <li key={c.url}>
                  <span className={text({ tone: 'muted' })}>{c.name}</span>{' '}
                  <span className={text({ mono: true, weight: 'medium', spaced: 'wide' })}>{c.code}</span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}>
              <Copy /> {copied ? 'Copied' : 'Copy link'}
            </Button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
