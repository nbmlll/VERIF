import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGroup } from '@/lib/panel'
import { tg } from '@/lib/telegram'

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
function html(title:string,body:string,status:number) {
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:Arial,sans-serif;background:#f4f7f8;color:#14252d;min-height:100vh;display:grid;place-items:center;margin:0;padding:24px}.card{max-width:520px;background:white;border:1px solid #dce6e9;border-radius:20px;padding:32px;line-height:1.6}h1{font-size:24px}a{color:#0b7580}</style></head><body><main class="card"><p>VERIF / GROUP ACCESS</p><h1>${title}</h1><p>${body}</p><a href="https://t.me">Return to Telegram</a></main></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})
}
export async function GET(request:NextRequest) {
  const params=request.nextUrl.searchParams
  const sessionId=params.get('session')||''
  if(!telegramLoginIsValid(params)||!/^[0-9a-f-]{36}$/i.test(sessionId)) return html('Could not verify','Please return to the group and open a fresh verification link.',403)
  const telegramUserId=Number(params.get('id'))
  const {data:session}=await db.from('verif_verification_sessions').select('id,chat_id,user_id,mode,expires_at,prompt_message_id').eq('id',sessionId).maybeSingle()
  if(!session||session.mode!=='web'||session.user_id!==telegramUserId||new Date(session.expires_at).getTime()<Date.now()) return html('Link expired','Ask a group administrator to restart verification.',403)
  const group=await getGroup(session.chat_id)
  if(!group) return html('Group unavailable','Ask a group administrator to restart verification.',404)
  try {
    await tg('restrictChatMember',{chat_id:session.chat_id,user_id:session.user_id,permissions:{can_send_messages:true,can_send_audios:true,can_send_documents:true,can_send_photos:true,can_send_videos:true,can_send_video_notes:true,can_send_voice_notes:true,can_send_polls:true,can_send_other_messages:true,can_add_web_page_previews:true},use_independent_chat_permissions:true})
    await db.from('verif_members').upsert({chat_id:session.chat_id,user_id:session.user_id,verified_at:new Date().toISOString()},{onConflict:'chat_id,user_id'})
    await db.from('verif_verification_sessions').delete().eq('id',session.id)
    await db.from('verif_action_audit').insert({chat_id:session.chat_id,actor_id:session.user_id,action:'web_verification',details:{session_id:session.id},outcome:'success'})
    if(session.prompt_message_id) {
      try { await tg('editMessageText',{chat_id:session.chat_id,message_id:session.prompt_message_id,text:'Telegram account verified. You can now send messages.'}) } catch {}
    }
    return html('Verification complete','Your Telegram account is verified. You can return to the group.',200)
  } catch(error) {
    console.error('[verif] web verification failed',error instanceof Error?error.message:'unknown error')
    return html('Verification could not be completed','The bot may need administrator permission to manage members. Please contact a group admin.',503)
  }
}
