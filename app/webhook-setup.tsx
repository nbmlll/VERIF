'use client'

import { useState } from 'react'

type SetupResult={ok:boolean;alreadySet?:boolean}

export function WebhookSetup() {
  const [secret,setSecret]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState(false)

  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!secret||busy) return
    setBusy(true)
    setMessage('')
    setSuccess(false)
    try {
      const response=await fetch('/api/telegram/setup',{method:'POST',headers:{authorization:`Bearer ${secret}`}})
      const result=await response.json() as SetupResult
      if(!response.ok||!result.ok) throw new Error('setup_failed')
      setSuccess(true)
      setMessage(result.alreadySet?'Webhook is already configured.':'Webhook configured successfully.')
    } catch {
      setMessage('Webhook setup failed. Check the secret and Telegram bot configuration.')
    } finally {
      setSecret('')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-foreground/10 bg-surface p-4 sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label htmlFor="cron-secret" className="text-sm font-medium">Webhook setup secret</label>
        <input id="cron-secret" name="secret" type="password" autoComplete="new-password" required value={secret} onChange={(event)=>setSecret(event.target.value)} placeholder="Paste CRON_SECRET from project Vars" className="min-h-11 rounded-lg border border-foreground/15 bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand" />
        <p className="text-xs leading-relaxed text-muted">Used once to authorize setup; it is not saved in the browser.</p>
      </div>
      <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-surface disabled:cursor-wait disabled:opacity-60">{busy?'Setting webhook…':'Set webhook'}</button>
      <p role="status" aria-live="polite" className={`text-sm leading-relaxed sm:basis-full ${success?'text-brand':'text-muted'}`}>{message}</p>
    </form>
  )
}
