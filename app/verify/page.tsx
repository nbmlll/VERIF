import Script from 'next/script'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { getGroup, groupSettings } from '@/lib/panel'
import { tg } from '@/lib/telegram'

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
  const enabled=!!session&&session.mode==='web'&&new Date(session.expires_at).getTime()>Date.now()&&!!group&&groupSettings(group).verification.web_enabled
  let username=''
  if(enabled) {
    try { username=(await tg<{username:string}>('getMe')).username } catch { username='' }
  }
  const origin=appOrigin(await headers())
  const authUrl=`${origin}/api/telegram/verify?session=${encodeURIComponent(id||'')}`
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-line bg-surface p-7 shadow-sm">
        <p className="font-mono text-sm uppercase tracking-widest text-brand">VERIF / GROUP ACCESS</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Verify your Telegram account</h1>
        {enabled&&username ? <>
          <p className="mt-4 leading-relaxed text-muted">Sign in with the same Telegram account that joined the group. VERIF checks the signed Telegram identity before restoring your ability to send messages.</p>
          <div className="mt-8 min-h-12"><Script src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login={username} data-size="large" data-auth-url={authUrl} data-request-access="write" strategy="afterInteractive" /></div>
          <p className="mt-5 text-sm leading-relaxed text-muted">The bot owner must register this site domain with the bot in BotFather before Telegram Login will work.</p>
        </> : <p className="mt-4 leading-relaxed text-muted">This verification link is invalid, expired, or web verification is disabled for this group. Return to the group and ask an admin to restart verification.</p>}
      </div>
    </main>
  )
}
