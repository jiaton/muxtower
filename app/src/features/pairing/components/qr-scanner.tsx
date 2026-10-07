import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'
import { Banner } from '@/components/ui/banner'

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike
  }
}

/** Camera QR scanner: BarcodeDetector where the browser has it, jsQR on canvas frames elsewhere (iOS). */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let done = false
    const canvas = document.createElement('canvas')
    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null

    const scan = async () => {
      const el = video.current
      if (done || !el) return
      if (el.readyState >= el.HAVE_CURRENT_DATA) {
        let text: string | null = null
        if (detector) {
          const codes = await detector.detect(el).catch(() => [])
          text = codes[0]?.rawValue ?? null
        } else {
          canvas.width = el.videoWidth
          canvas.height = el.videoHeight
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            ctx.drawImage(el, 0, 0)
            text = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null
          }
        }
        if (text) {
          done = true
          onResult(text)
          return
        }
      }
      frame = requestAnimationFrame(() => void scan())
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
          void scan()
        }
      })
      .catch(() => setError('Camera unavailable. Allow camera access, or paste the link instead.'))
    if (!navigator.mediaDevices) setError('This browser cannot use the camera here (HTTPS is required).')

    return () => {
      done = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onResult])

  if (error) return <Banner tone="warning">{error}</Banner>
  return <video ref={video} className="aspect-square w-full rounded-md bg-terminal-bg object-cover" muted playsInline aria-label="Camera preview" />
}
