import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGroup } from '@/lib/panel'
import { tg } from '@/lib/telegram'
import { langOf, tr, type Language } from '@/lib/i18n'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const token=process.env.TELEGRAM_BOT_TOKEN!
function telegramLoginIsValid(params:URLSearchParams) {
  const hash=params.get('hash')
  const authDate=Number(params.get('auth_date'))
  if(!hash||!Number.isFinite(authDate)||Date.now()/1000-authDate>300||authDate>Date.now()/1000+30) return false
  const values=[...params.entries()].filter(([key])=>key!=='hash').sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('\n')
  const secret=createHash('sha256').update(token).digest()
  const expected=createHmac('sha256',secret).update(values).digest('hex')
  const supplied=Buffer.from(hash)
  const actual=Buffer.from(expected)
  return supplied.length===actual.length&&timingSafeEqual(supplied,actual)
}
function html(title:string,body:string,status:number,lang:Language='en') {
  return new NextResponse(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:Arial,sans-serif;background:#f4f7f8;color:#14252d;min-height:100vh;display:grid;place-items:center;margin:0;padding:24px}.card{max-width:520px;background:white;border:1px solid rgba(20,37,45,.1);border-radius:20px;padding:32px;line-height:1.6}h1{font-size:24px}a{color:#0b7580}</style></head><body><main class="card"><p>VERIF / ${tr(lang,'verification')}</p><h1>${title}</h1><p>${body}</p><a href="https://t.me">${tr(lang,'returnTelegram')}</a></main></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})
}
export async function GET(request:NextRequest) {
  const params=request.nextUrl.searchParams
  const sessionId=params.get('session')||''
  if(!/^[0-9a-f-]{36}$/i.test(sessionId)) return html(tr('en','verifyFailTitle'),tr('en','verifyInvalid'),403)
  const {data:session}=await db.from('verif_verification_sessions').select('id,chat_id,user_id,mode,expires_at,prompt_message_id').eq('id',sessionId).maybeSingle()
  const group=session?await getGroup(session.chat_id):null
  const lang=langOf(group?.language)
  if(!telegramLoginIsValid(params)) return html(tr(lang,'verifyFailTitle'),tr(lang,'verifyInvalid'),403,lang)
  const telegramUserId=Number(params.get('id'))
  if(!session||session.mode!=='web'||session.user_id!==telegramUserId||new Date(session.expires_at).getTime()<Date.now()) return html(tr(lang,'verifyFailTitle'),tr(lang,'verifyExpired'),403,lang)
  if(!group) return html(tr(lang,'verifyFailTitle'),tr(lang,'verifyUnavailable'),404,lang)
  try {
    await tg('restrictChatMember',{chat_id:session.chat_id,user_id:session.user_id,permissions:{can_send_messages:true,can_send_audios:true,can_send_documents:true,can_send_photos:true,can_send_videos:true,can_send_video_notes:true,can_send_voice_notes:true,can_send_polls:true,can_send_other_messages:true,can_add_web_page_previews:true},use_independent_chat_permissions:true})
    await db.from('verif_members').upsert({chat_id:session.chat_id,user_id:session.user_id,verified_at:new Date().toISOString()},{onConflict:'chat_id,user_id'})
    await db.from('verif_verification_sessions').delete().eq('id',session.id)
    await db.from('verif_action_audit').insert({chat_id:session.chat_id,actor_id:session.user_id,action:'web_verification',details:{session_id:session.id},outcome:'success'})
    if(session.prompt_message_id) {
      try { await tg('editMessageText',{chat_id:session.chat_id,message_id:session.prompt_message_id,text:tr(lang,'verifySuccessMessage')}) } catch {}
    }
    return html(tr(lang,'verifySuccess'),tr(lang,'verifySuccessBody'),200,lang)
  } catch(error) {
    console.error('[verif] web verification failed',error instanceof Error?error.message:'unknown error')
    return html(tr(lang,'verifyFailTitle'),tr(lang,'verifyFailBody'),503,lang)
  }
}
