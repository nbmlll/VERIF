import Script from 'next/script'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { getGroup, groupSettings } from '@/lib/panel'
import { tg } from '@/lib/telegram'
import { langOf, tr } from '@/lib/i18n'

export const dynamic='force-dynamic'
function appOrigin(forwarded:Headers) {
  if(process.env.APP_URL) return process.env.APP_URL.replace(/\/$/,'')
  if(process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const host=forwarded.get('x-forwarded-host')||forwarded.get('host')
  const proto=forwarded.get('x-forwarded-proto')||'https'
  return host?`${proto}://${host}`:'http://localhost:3000'
}
export default async function VerifyPage({searchParams}:{searchParams:Promise<{id?:string}>}) {
  const {id}=await searchParams
  const validId=typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)
  const {data:session}=validId?await db.from('verif_verification_sessions').select('id,chat_id,user_id,mode,expires_at').eq('id',id).maybeSingle():{data:null}
  const group=session?await getGroup(session.chat_id):null
  const lang=langOf(group?.language)
  const enabled=!!session&&session.mode==='web'&&new Date(session.expires_at).getTime()>Date.now()&&!!group&&groupSettings(group).verification.web_enabled
  let username=''
  if(enabled) {
    try { username=(await tg<{username:string}>('getMe')).username } catch { username='' }
  }
  const origin=appOrigin(await headers())
  const authUrl=`${origin}/api/telegram/verify?session=${encodeURIComponent(id||'')}`
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-foreground/10 bg-surface p-7 shadow-sm">
        <p className="font-mono text-sm uppercase tracking-widest text-brand">VERIF / {tr(lang,'verification')}</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{tr(lang,'verifyTitle')}</h1>
        {enabled&&username ? <>
          <p className="mt-4 leading-relaxed text-muted">{tr(lang,'verifyIntro')}</p>
          <div className="mt-8 min-h-12"><Script src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login={username} data-size="large" data-auth-url={authUrl} data-request-access="write" strategy="afterInteractive" /></div>
          <p className="mt-5 text-sm leading-relaxed text-muted">{tr(lang,'verifyOwnerSetup')}</p>
        </> : <p className="mt-4 leading-relaxed text-muted">{tr(lang,'verifyInvalid')}</p>}
      </div>
    </main>
  )
}
