'use client'

import { useState } from 'react'

type SetupResult={ok:boolean;alreadySet?:boolean}

export function WebhookSetup() {
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState(false)

  async function setupWebhook() {
    if(busy) return
    setBusy(true)
    setMessage('')
    setSuccess(false)
    try {
      const response=await fetch('/api/telegram/setup',{method:'POST'})
      const result=await response.json() as SetupResult
      if(!response.ok||!result.ok) throw new Error('setup_failed')
      setSuccess(true)
      setMessage(result.alreadySet?'Webhook is already configured.':'Webhook configured successfully.')
    } catch {
      setMessage('Webhook setup failed. Check the server environment and Telegram bot configuration.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-foreground/10 bg-surface p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold">Telegram webhook</p>
        <p className="text-sm leading-relaxed text-muted">Configure it using the server-side bot credentials. Secrets stay in project environment variables.</p>
      </div>
      <button type="button" onClick={setupWebhook} disabled={busy} className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-surface disabled:cursor-wait disabled:opacity-60">{busy?'Setting webhook…':'Set webhook'}</button>
      <p role="status" aria-live="polite" className={`text-sm leading-relaxed sm:basis-full ${success?'text-brand':'text-muted'}`}>{message}</p>
    </div>
  )
}
