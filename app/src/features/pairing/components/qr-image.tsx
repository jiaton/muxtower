import { toDataURL } from 'qrcode'
import { useEffect, useState } from 'react'

export function QrImage({ text, label }: { text: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void toDataURL(text, { margin: 2, scale: 8, errorCorrectionLevel: 'L' }).then((url) => live && setSrc(url))
    return () => {
      live = false
    }
  }, [text])
  return src ? (
    <img src={src} alt={label} className="mx-auto w-full max-w-72 rounded-md" />
  ) : (
    <div className="mx-auto aspect-square w-full max-w-72 rounded-md bg-surface-muted" aria-label={label} />
  )
}
