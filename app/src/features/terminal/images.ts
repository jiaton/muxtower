/** Pictures attached to a message, made small on the phone before they go: at most LONG_EDGE pixels on
 *  the long side (what Claude reads at full detail anyway), re-encoded only when they must shrink. */

export const LONG_EDGE = 1568
export const MAX_IMAGES = 4
const KEEP_BYTES = 1_500_000 // smaller than this and small enough: sent as it is
const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export type ImageType = (typeof TYPES)[number]

export interface Attachment {
  id: string
  blob: Blob
  type: ImageType
  preview: string // an object URL: revoke it when the attachment goes
}

const isType = (type: string): type is ImageType => (TYPES as readonly string[]).includes(type)

/** A picture as it will be sent: as it is when it already fits, else drawn smaller as JPEG. The decoded
 *  bitmap and the canvas are let go as soon as it is encoded. */
export async function shrink(file: Blob): Promise<{ blob: Blob; type: ImageType }> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && isType(file.type) && file.size <= KEEP_BYTES) return { blob: file, type: file.type }
    const [width, height] = [Math.round(bitmap.width * scale), Math.round(bitmap.height * scale)]
    const canvas = document.createElement('canvas')
    Object.assign(canvas, { width, height })
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white' // JPEG has no transparency: what was see-through comes out white, not black
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    Object.assign(canvas, { width: 0, height: 0 })
    if (!blob) throw new Error('could not encode the image')
    return { blob, type: 'image/jpeg' }
  } finally {
    bitmap.close()
  }
}

/** The bytes as base64, for the message body. */
export const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** The pictures among pasted or dropped files. */
export const imagesIn = (files: FileList | File[] | null | undefined) => Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
