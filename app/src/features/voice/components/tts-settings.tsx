import { useQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { ink } from '@/components/ui/intents'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import { useDaemon } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'
import { recheckHubVoice } from '../live/hub-voice'

const WHY: Record<string, string> = {
  off: "Off: Read aloud uses the phone's voice.",
  key: "No key, or Azure refused it: Read aloud uses the phone's voice. Set tts.api_key_file (a 0600 file) in the config.",
  cap: "This month's cap is reached: the phone's voice until the month turns.",
  quota: "Azure's quota is used up: the phone's voice for now.",
}
// A sample in the voice's language (by its name, e.g. zh-CN-…; none set: the English voice's).
const SAMPLES: Record<string, string> = {
  zh: 'staging 上的 deploy 已经完成了，健康检查全部通过。',
  ja: 'staging へのデプロイが終わり、ヘルスチェックはすべて通りました。',
  ko: 'staging 배포가 끝났고 상태 점검도 모두 통과했습니다.',
  en: 'The deploy to staging is done, and every health check passed.',
}
const sampleFor = (voice: string) => SAMPLES[voice.split('-')[0] ?? ''] ?? SAMPLES.en!
const count = (n: number) => n.toLocaleString('en-US')

/** Under "Read aloud voice" in the hub's settings: whether its voice is in use (and why not), the key file
 *  (there or not; the key itself is never shown), this month's characters against the cap and Azure's
 *  free tier, and a preview of the voice and style set. */
export function TtsSettings({ daemonId }: { daemonId: string }) {
  const daemon = useDaemon(daemonId)
  const status = useQuery({
    queryKey: daemonKey(daemonId, 'tts'),
    enabled: !!daemon,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      recheckHubVoice()
      return unwrap(await createDaemonClient(daemon!).GET('/v1/tts'))
    },
  })
  const [preview, setPreview] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const s = status.data
  if (!s) return null
  const listen = async () => {
    setPreview({ busy: true, error: null })
    try {
      const res = await createDaemonClient(daemon!).POST('/v1/tts', {
        body: { text: sampleFor(s.voice), language: s.voice.split('-')[0] || 'en' },
        parseAs: 'blob',
      })
      if (!res.data) throw new Error(res.error && 'detail' in res.error ? String(res.error.detail) : 'no voice')
      const url = URL.createObjectURL(res.data as Blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      setPreview({ busy: false, error: null })
    } catch (error) {
      setPreview({ busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <p className={ink.body}>
        {s.available
          ? `In use: ${s.voice || 'a voice for each language'}${s.style ? ` (${s.style})` : ''}, ${s.region}.`
          : (WHY[s.why_not ?? 'off'] ?? s.why_not)}
      </p>
      <p className={ink.meta}>
        Key file: {s.key_present ? 'present' : 'missing'} · This month ({s.month}): {count(s.characters)} characters of the{' '}
        {count(s.soft_cap)} cap · Azure's free tier: {count(s.free_tier)} a month
      </p>
      <Button variant="secondary" size="sm" className="self-start" disabled={!s.available || preview.busy} onClick={() => void listen()}>
        <Play /> Preview
      </Button>
      {preview.error ? <Banner tone="error">{preview.error}</Banner> : null}
    </div>
  )
}
