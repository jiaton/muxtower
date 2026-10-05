import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDaemonsStore } from '../store'

export function AddDaemonForm({ onAdded }: { onAdded?: () => void }) {
  const add = useDaemonsStore((s) => s.add)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    add({ name: name.trim() || new URL(url).host, url, token: token.trim() || null })
    setName('')
    setUrl('')
    setToken('')
    onAdded?.()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Label>
        Daemon URL
        <Input type="url" required placeholder="https://daemon.example" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Label>
      <Label>
        Token
        <Input
          type="password"
          autoComplete="off"
          placeholder="from `muxtower token add <name>`"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </Label>
      <Label>
        Name <span className="font-normal text-fg-muted">(optional)</span>
        <Input placeholder="build box" value={name} onChange={(e) => setName(e.target.value)} />
      </Label>
      <Button type="submit" className="self-start">
        Add daemon
      </Button>
    </form>
  )
}
