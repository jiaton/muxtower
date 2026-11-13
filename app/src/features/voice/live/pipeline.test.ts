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

describe('commands (English, the default)', () => {
  it('a segment that is only a command, fillers and punctuation aside', () => {
    expect(commandIn('Send.')).toBe('send')
    expect(commandIn('um, send')).toBe('send')
    expect(commandIn('Pause')).toBe('pause')
    expect(commandIn('undo.')).toBe('undo')
    expect(commandIn('clear')).toBe('clear')
    expect(commandIn('please send this')).toBeNull() // more than the command: text
    expect(normalize('  Um, SEND it! ')).toBe('send it')
    // As Whisper mishears a one-word clip (seen in real use).
    expect(commandIn('Then send.')).toBe('send')
    expect(commandIn('End.')).toBe('send')
    expect(commandIn('the end')).toBeNull() // not all of it a command
  })

  it('only send may trail a sentence; it is stripped, with the word that joins it', () => {
    expect(trailingSend('fix the test and send')).toBe('fix the test')
    expect(trailingSend('send the logs to bob and then send')).toBe('send the logs to bob')
    expect(trailingSend('fix the test, send.')).toBe('fix the test')
    expect(trailingSend('please resend')).toBeNull() // not the word send
    expect(trailingSend('pause the deploy first')).toBeNull()
    expect(trailingSend('send')).toBeNull() // nothing before it
  })
})

describe('LivePipeline', () => {
  it('appends text, executes a short command, and sends what landed', async () => {
    const t = setup()
    void t.say(4000)
    void t.say(800)
    await t.flush()
    t.uploads[0]!.resolve('fix the login test')
    await t.flush()
    t.uploads[1]!.resolve('send')
    await t.flush()
    expect(t.sent).toEqual(['a: fix the login test'])
    expect(t.cues).toEqual(['sent'])
  })

  it('a short segment KWS-free: transcribed, and only an exact command acts; otherwise it is text', async () => {
    const t = setup()
    void t.say(1200)
    await t.flush()
    t.uploads[0]!.resolve('ok, clear it then')
    await t.flush()
    expect(t.boxes.a).toEqual(['ok, clear it then'])
    expect(t.cues).toEqual([])
  })

  it('a long segment ending in send: the rest appended, then sent; a command word inside it is text', async () => {
    const t = setup()
    void t.say(5000)
    await t.flush()
    t.uploads[0]!.resolve('pause the deploy first, then clear the cache, send.')
    await t.flush()
    expect(t.sent).toEqual(['a: pause the deploy first, then clear the cache'])
    expect(t.live.state).toBe('listening')
  })

  it('a long segment that is only send: sent, not typed', async () => {
    const t = setup()
    void t.say(4000)
    void t.say(2200) // the word, with a pause around it: past SHORT_MS
    await t.flush()
    t.uploads[0]!.resolve('fix the login test.')
    await t.flush()
    t.uploads[1]!.resolve('Send.')
    await t.flush()
    expect(t.sent).toEqual(['a: fix the login test.']) // "Send." never typed into the box
    expect(t.boxes.a).toEqual([])
  })

  it('clear, undo and pause act only as a segment of their own', async () => {
    const t = setup()
    for (const [ms, text] of [
      [3000, 'first part'],
      [3000, 'second part'],
      [700, 'undo'],
      [3000, 'and then undo counts as text'],
    ] as const) {
      void t.say(ms)
      await t.flush()
      t.uploads.at(-1)!.resolve(text)
      await t.flush()
    }
    expect(t.boxes.a).toEqual(['first part', 'and then undo counts as text'])
    void t.say(600)
    await t.flush()
    t.uploads.at(-1)!.resolve('clear')
    await t.flush()
    expect(t.boxes.a).toEqual([])
    expect(t.cues).toEqual(['undone', 'cleared'])
  })

  it('send with an empty box does nothing but say so', async () => {
    const t = setup()
    void t.say(600)
    await t.flush()
    t.uploads[0]!.resolve('send')
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
    t.uploads[2]!.resolve('send') // the send is back first…
    t.uploads[1]!.resolve('second part') // …then the second
    await t.flush()
    await t.flush()
    expect(t.sent).toEqual([]) // the first has not landed: nothing sent yet
    t.uploads[0]!.resolve('first part')
    await sending
    expect(t.sent).toEqual(['a: first part second part'])
  })

  it('paused: nothing is uploaded, ever; resuming listens again', async () => {
    const t = setup()
    void t.say(600)
    void t.say(4000) // said after "pause": must not leave the device
    await t.flush()
    expect(t.uploads).toHaveLength(1) // held behind the short one
    t.uploads[0]!.resolve('pause')
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
    t.uploads[1]!.resolve('for b')
    t.uploads[0]!.resolve('for a')
    await t.flush()
    await t.flush()
    expect(t.boxes).toEqual({ a: ['for a'], b: ['for b'] })
    await t.say(3000, null) // spoken on no session page: dropped, not uploaded
    expect(t.transcribe).toHaveBeenCalledTimes(2)
  })

  it('rule 1: a short segment the spotter is sure of acts at once, and is not uploaded', async () => {
    const t = setup()
    void t.say(4000)
    await t.flush()
    t.uploads[0]!.resolve('fix the login test')
    await t.say(700, A, 'send')
    expect(t.sent).toEqual(['a: fix the login test'])
    expect(t.transcribe).toHaveBeenCalledTimes(1) // only the sentence
  })

  it('a short segment the spotter is not sure of is transcribed, and the transcript decides', async () => {
    const t = setup()
    void t.say(900, A, null)
    await t.flush()
    await t.flush()
    expect(t.uploads).toHaveLength(1)
    expect(t.uploads[0]!.ask).toEqual({ hint: 'command' })
    t.uploads[0]!.resolve('okay')
    await t.flush()
    expect(t.boxes.a).toEqual(['okay'])
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

describe('a command spotted as soon as its speaker paused', () => {
  it('is done at once when nothing waits, and nothing is uploaded', async () => {
    const { live, boxes, sent, transcribe } = setup()
    boxes.a = ['fix the flaky test']
    await live.spotted('send', A)
    expect(sent).toEqual(['a: fix the flaky test'])
    expect(transcribe).not.toHaveBeenCalled()
  })

  it('waits for the words said before it, saying so, then sends them', async () => {
    const { live, sent, say, uploads, flush } = setup()
    void say(4000)
    await flush()
    const sending = live.spotted('send', A)
    expect(live.then).toBe('send') // "writing… then sending"
    expect(sent).toEqual([])
    uploads[0]!.resolve('update the changelog')
    await sending
    expect(sent).toEqual(['a: update the changelog'])
    expect(live.then).toBeNull()
  })

  it('paused, only resume is heard', async () => {
    const { live, boxes, sent } = setup()
    boxes.a = ['draft']
    live.pause()
    await live.spotted('send', A)
    expect(sent).toEqual([])
    await live.spotted('resume', A)
    expect(live.state).toBe('listening')
  })
})
