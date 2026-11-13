import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleCheck, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useDaemonMe } from '../api/use-daemon-me'
import type { Daemon } from '@/lib/daemons/types'
import { daemonKey } from '@/lib/query'
import { useLoginRunning, useLoginSession, useStartClaudeLogin } from '../api/use-claude-login'
import { Label } from '@/components/ui/label'
import { ink } from '@/components/ui/intents'

const STILL_WAITING_MS = 8_000 // after the code, longer than a login takes: a wrong code is said in its session
const RECHECK_MS = 2_000 // the daemon finds the new login at its next Remote Control poll (every 5 s)
const RECHECK_FOR_MS = 20_000

/** Logs the daemon's machine in to Claude again (`claude auth login` there): open the sign-in page, paste
 *  the code it gives. Logged in, its session ends, and the daemon reads Remote Control again: only that says
 *  it worked (a session can also end without logging in). One left unfinished is ended on close. */
export function ClaudeLoginDialog({ daemon, onClose }: { daemon: Daemon; onClose: () => void }) {
  const start = useStartClaudeLogin(daemon.id)
  const { sendCode, cancel } = useLoginSession(daemon.id)
  const me = useDaemonMe(daemon.id)
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [slow, setSlow] = useState(false)
  const [endedAt, setEndedAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const started = useRef(false)
  const login = start.data
  const running = useLoginRunning(daemon.id, login?.session.id)
  const ended = sentAt !== null && running === false
  const loggedIn = ended && me.data?.claude_login_expired === false
  const failed = ended && !loggedIn && endedAt !== null && now - endedAt > RECHECK_FOR_MS

  useEffect(() => {
    if (started.current) return
    started.current = true
    start.mutate()
  }, [start])
  useEffect(() => {
    if (sentAt === null) return
    const timer = setTimeout(() => setSlow(true), STILL_WAITING_MS)
    return () => clearTimeout(timer)
  }, [sentAt])
  useEffect(() => {
    if (!ended || loggedIn || failed) return
    const recheck = () => {
      setNow(Date.now())
      void queryClient.invalidateQueries({ queryKey: daemonKey(daemon.id, 'me') })
    }
    setEndedAt((at) => at ?? Date.now())
    recheck()
    const timer = setInterval(recheck, RECHECK_MS)
    return () => clearInterval(timer)
  }, [ended, loggedIn, failed, daemon.id, queryClient])

  const close = () => {
    if (login && running !== false) cancel.mutate(login.session.id)
    onClose()
  }
  const submit = () => {
    if (!login || !code.trim()) return
    sendCode.mutate({ sessionId: login.session.id, code: code.trim() }, { onSuccess: () => setSentAt(Date.now()) })
  }
  const sessionLink = login ? (
    <Link
      to="/d/$daemonId/s/$sessionId"
      params={{ daemonId: daemon.id, sessionId: login.session.id }}
      className={ink.link}
      onClick={onClose}
    >
      see what it says
    </Link>
  ) : null

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && close()}>
      <DialogContent
        title={`Log ${daemon.name} in to Claude`}
        description="Sessions from Claude Desktop and the Claude app are read with this login."
      >
        {start.error ? <Banner tone="error">{start.error.message}</Banner> : null}
        {start.isPending ? <p className={ink.hint}>Starting claude auth login…</p> : null}
        {loggedIn ? (
          <>
            <Banner>
              <CircleCheck />
              <span>Logged in. Sessions from Claude Desktop update here again.</span>
            </Banner>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : failed ? (
          <>
            <Banner tone="error">It ended without logging in.</Banner>
            <Button onClick={onClose}>Close</Button>
          </>
        ) : ended ? (
          <p className={ink.hint}>Checking the new login…</p>
        ) : login ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            {login.url ? (
              <Button asChild variant="outline">
                <a href={login.url} target="_blank" rel="noreferrer">
                  1. Open the sign-in page <ExternalLink />
                </a>
              </Button>
            ) : (
              <Banner tone="warning">
                <span>It showed no sign-in link: {sessionLink}.</span>
              </Banner>
            )}
            <Label>
              2. Paste the code it gives
              <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} className={ink.code} />
            </Label>
            {sendCode.error ? <Banner tone="error">{sendCode.error.message}</Banner> : null}
            {slow ? (
              <Banner tone="warning">
                <span>Not logged in yet: {sessionLink}.</span>
              </Banner>
            ) : null}
            <Button type="submit" disabled={!code.trim() || sendCode.isPending || (sentAt !== null && !slow)}>
              {sentAt !== null && !slow ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
