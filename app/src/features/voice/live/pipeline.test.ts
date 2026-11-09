import { describe, expect, it, vi } from 'vitest'
import { commandIn, normalize, trailingSend } from './commands'
import { LivePipeline, type Ask, type BoxOps, type Target } from './pipeline'

const A: Target = { daemonId: 'd', sessionId: 'a' }
const B: Target = { daemonId: 'd', sessionId: 'b' }

/** A pipeline whose transcriptions resolve when the test says, with message boxes as plain strings. */
function setup() {
  const boxes: Record<string, string[]> = {}
  const sent: string[] = []
  const cues: string[] = []
  const uploads: { audio: Blob; ask: Ask; resolve: (text: string) => void }[] = []
  const ops: BoxOps = {
    append: (t, text) => (boxes[t.sessionId] = [...(boxes[t.sessionId] ?? []), text]),
    clear: (t) => (boxes[t.sessionId] = []),
    undo: (t) => !!boxes[t.sessionId]?.length && (boxes[t.sessionId]!.pop(), true),
    send: (t) => {
      if (!boxes[t.sessionId]?.length) return 'empty'
      sent.push(`${t.sessionId}: ${boxes[t.sessionId]!.join(' ')}`)
      boxes[t.sessionId] = []
      return 'sent'
    },
  }
  const transcribe = vi.fn(
    (_: Target, audio: Blob, ask: Ask) =>
      new Promise<{ text: string; language: string | null }>((resolve) =>
        uploads.push({ audio, ask, resolve: (text) => resolve({ text, language: ask.language ?? null }) }),
      ),
  )
  const spot = vi.fn(async (pcm: Float32Array) => (spotted.get(pcm) ?? null) as never)
  const spotted = new Map<Float32Array, string | null>()
  const live = new LivePipeline({ transcribe, ops: () => ops, cue: (c) => cues.push(c), spot })
  const say = (ms: number, target: Target | null = A, kws?: string | null) => {
    const pcm = new Float32Array(1)
    if (kws !== undefined) spotted.set(pcm, kws)
    return live.segment({ target, audio: new Blob([String(ms)]), ms, pcm: kws !== undefined ? pcm : undefined })
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))
  return { live, boxes, sent, cues, uploads, transcribe, say, flush, spot }
}

describe('commands', () => {
  it('a segment that is only a command, fillers and punctuation aside', () => {
    expect(commandIn('发送。')).toBe('send')
    expect(commandIn('嗯，发送')).toBe('send')
    expect(commandIn('Send.')).toBe('send')
    expect(commandIn('暂停')).toBe('pause')
    expect(commandIn('撤回上一句。')).toBe('undo')
    expect(commandIn('清空')).toBe('clear')
    expect(commandIn('请发送这个')).toBeNull() // more than the command: text
    expect(normalize('  Um, SEND it! ')).toBe('send it')
    // As Whisper mishears a one-word clip (seen in real use).
    expect(commandIn('Façam!')).toBe('send')
    expect(commandIn('Then send.')).toBe('send')
    expect(commandIn('End.')).toBe('send')
    expect(commandIn('发松')).toBe('send')
    expect(commandIn('站停。')).toBe('pause')
    expect(commandIn('the end')).toBeNull() // not all of it a command
  })

  it('only send may trail a sentence; it is stripped', () => {
    expect(trailingSend('修一下这个测试，发送。')).toBe('修一下这个测试')
    expect(trailingSend('fix the test and send')).toBe('fix the test') // the joining word goes with it
    expect(trailingSend('修一下测试，然后发送')).toBe('修一下测试')
    expect(trailingSend('send the logs to bob and then send')).toBe('send the logs to bob')
    expect(trailingSend('fix the test, send.')).toBe('fix the test')
    expect(trailingSend('please resend')).toBeNull() // not the word send
    expect(trailingSend('先暂停一下')).toBeNull()
    expect(trailingSend('发送')).toBeNull() // nothing before it
  })
})

describe('LivePipeline', () => {
  it('appends text, executes a short command, and sends what landed', async () => {
    const t = setup()
    void t.say(4000)
    void t.say(800)
    await t.flush()
    t.uploads[0]!.resolve('修一下登录的测试')
    await t.flush()
    t.uploads[1]!.resolve('发送')
    await t.flush()
    expect(t.sent).toEqual(['a: 修一下登录的测试'])
    expect(t.cues).toEqual(['sent'])
  })

  it('a short segment KWS-free: transcribed, and only an exact command acts; otherwise it is text', async () => {
    const t = setup()
    void t.say(1200)
    await t.flush()
    t.uploads[0]!.resolve('好的，清空吧')
    await t.flush()
    expect(t.boxes.a).toEqual(['好的，清空吧'])
    expect(t.cues).toEqual([])
  })

  it('a long segment ending in send: the rest appended, then sent; a command word inside it is text', async () => {
    const t = setup()
    void t.say(5000)
    await t.flush()
    t.uploads[0]!.resolve('先暂停一下部署，然后清空缓存，发送。')
    await t.flush()
    expect(t.sent).toEqual(['a: 先暂停一下部署，然后清空缓存'])
    expect(t.live.state).toBe('listening')
  })

  it('clear, undo and pause act only as a segment of their own', async () => {
    const t = setup()
    for (const [ms, text] of [
      [3000, '第一句'],
      [3000, '第二句'],
      [700, '撤回上一句'],
      [3000, '然后撤回上一句也算文字'],
    ] as const) {
      void t.say(ms)
      await t.flush()
      t.uploads.at(-1)!.resolve(text)
      await t.flush()
    }
    expect(t.boxes.a).toEqual(['第一句', '然后撤回上一句也算文字'])
    void t.say(600)
    await t.flush()
    t.uploads.at(-1)!.resolve('清空')
    await t.flush()
    expect(t.boxes.a).toEqual([])
    expect(t.cues).toEqual(['undone', 'cleared'])
  })

  it('send with an empty box does nothing but say so', async () => {
    const t = setup()
    void t.say(600)
    await t.flush()
    t.uploads[0]!.resolve('发送')
    await t.flush()
    expect(t.sent).toEqual([])
    expect(t.cues).toEqual(['empty'])
  })

  it('a standalone send waits for the segments before it to land, in order, then sends', async () => {
    const t = setup()
    void t.say(4000) // still transcribing…
    void t.say(5000) // …and this one too
    const sending = t.say(700)
    await t.flush()
    expect(t.uploads).toHaveLength(3) // all three upload at once (no short one before them to wait for)
    t.uploads[2]!.resolve('发送') // the send is back first…
    t.uploads[1]!.resolve('第二段') // …then the second
    await t.flush()
    await t.flush()
    expect(t.sent).toEqual([]) // the first has not landed: nothing sent yet
    t.uploads[0]!.resolve('第一段')
    await sending
    expect(t.sent).toEqual(['a: 第一段 第二段'])
  })

  it('paused: nothing is uploaded, ever; resuming listens again', async () => {
    const t = setup()
    void t.say(600)
    void t.say(4000) // said after "pause": must not leave the device
    await t.flush()
    expect(t.uploads).toHaveLength(1) // held behind the short one
    t.uploads[0]!.resolve('暂停')
    await t.flush()
    await t.flush()
    expect(t.live.state).toBe('paused')
    expect(t.transcribe).toHaveBeenCalledTimes(1)
    await t.say(800)
    await t.say(5000)
    expect(t.transcribe).toHaveBeenCalledTimes(1) // paused: nothing at all
    t.live.resume()
    void t.say(3000)
    await t.flush()
    expect(t.transcribe).toHaveBeenCalledTimes(2)
    expect(t.cues).toEqual(['paused', 'resumed'])
  })

  it('a segment lands where its speech started, wherever the owner went since', async () => {
    const t = setup()
    void t.say(4000, A) // started on session a
    void t.say(3000, B) // the owner moved to b
    await t.flush()
    t.uploads[1]!.resolve('给 b 的')
    t.uploads[0]!.resolve('给 a 的')
    await t.flush()
    await t.flush()
    expect(t.boxes).toEqual({ a: ['给 a 的'], b: ['给 b 的'] })
    await t.say(3000, null) // spoken on no session page: dropped, not uploaded
    expect(t.transcribe).toHaveBeenCalledTimes(2)
  })

  it('rule 1: a short segment the spotter is sure of acts at once, and is not uploaded', async () => {
    const t = setup()
    void t.say(4000)
    await t.flush()
    t.uploads[0]!.resolve('修一下登录的测试')
    await t.say(700, A, 'send')
    expect(t.sent).toEqual(['a: 修一下登录的测试'])
    expect(t.transcribe).toHaveBeenCalledTimes(1) // only the sentence
  })

  it('a short segment the spotter is not sure of is transcribed, and the transcript decides', async () => {
    const t = setup()
    void t.say(900, A, null)
    await t.flush()
    await t.flush()
    expect(t.uploads).toHaveLength(1)
    expect(t.uploads[0]!.ask).toEqual({ hint: 'command' })
    t.uploads[0]!.resolve('好的')
    await t.flush()
    expect(t.boxes.a).toEqual(['好的'])
  })

  it('paused: the spotter alone listens, for "resume"; nothing is uploaded', async () => {
    const t = setup()
    await t.say(600, A, 'pause')
    expect(t.live.state).toBe('paused')
    await t.say(700, A, 'send') // heard, but paused: no command but resume
    await t.say(5000, A) // long: not even spotted
    expect(t.live.state).toBe('paused')
    await t.say(700, A, 'resume')
    expect(t.live.state).toBe('listening')
    expect(t.transcribe).not.toHaveBeenCalled()
    expect(t.sent).toEqual([])
    expect(t.cues).toEqual(['paused', 'resumed'])
  })

  it('a short segment the spotter is not sure of is still transcribed: a missed command is caught there', async () => {
    const t = setup()
    void t.say(300, A, null)
    await t.flush()
    await t.flush()
    expect(t.transcribe).toHaveBeenCalledTimes(1)
    t.uploads[0]!.resolve('Send.')
    await t.flush()
    expect(t.cues).toEqual(['empty']) // a send, with nothing in the box: said so
  })

  it('a tiny segment is still transcribed when no spotter is loaded', async () => {
    const t = setup()
    void t.say(300, A, undefined)
    await t.flush()
    expect(t.transcribe).toHaveBeenCalledTimes(1)
  })
})
