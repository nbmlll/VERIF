import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clearVerificationLocations, getVerificationLocations } from '@/lib/panel'
import { tg, deleteMessage } from '@/lib/telegram'

export const runtime='nodejs'
export const dynamic='force-dynamic'
function isAuthorized(request:NextRequest) {
  const secret=process.env.CRON_SECRET
  if(!secret) return false
  const provided=Buffer.from(request.headers.get('authorization')||'')
  const expected=Buffer.from(`Bearer ${secret}`)
  return provided.length===expected.length&&timingSafeEqual(provided,expected)
}
export async function GET(request:NextRequest) {
  if(!isAuthorized(request)) return NextResponse.json({ok:false},{status:401})
  const origin=process.env.APP_URL?.replace(/\/$/,'') || (process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:new URL(request.url).origin)
  const webhookUrl=`${origin}/api/telegram/webhook`
  let webhookRegistered=false
  try {
    const current=await tg<{url:string}>('getWebhookInfo')
    if(current.url!==webhookUrl) {
      const secretToken=await import('node:crypto').then(({createHash})=>createHash('sha256').update(`${process.env.TELEGRAM_BOT_TOKEN}:verif-webhook`).digest('hex'))
      await tg('setWebhook',{url:webhookUrl,secret_token:secretToken,allowed_updates:['message','callback_query','my_chat_member','chat_member'],drop_pending_updates:false})
      webhookRegistered=true
    }
  } catch(error) { console.error('[verif] webhook registration failed',error instanceof Error?error.message:'unknown error') }
  const now=new Date().toISOString()
  const {data:expired}=await db.from('verif_verification_sessions').select('id,chat_id,user_id,prompt_message_id').lt('expires_at',now).limit(100)
  let sessionsExpired=0
  for(const session of expired||[]) {
    try {
      await tg('banChatMember',{chat_id:session.chat_id,user_id:session.user_id,until_date:Math.floor(Date.now()/1000)+30,revoke_messages:true})
      await tg('unbanChatMember',{chat_id:session.chat_id,user_id:session.user_id,only_if_banned:true})
      const locations=await getVerificationLocations(session.user_id,session.id)
      const prompt=locations.prompt||(session.prompt_message_id?{chat_id:session.chat_id,message_id:session.prompt_message_id}:undefined)
      for(const location of [prompt,locations.notice]) if(location) {
        await deleteMessage(location.chat_id,location.message_id)
        await db.from('verif_scheduled_deletes').delete().eq('chat_id',location.chat_id).eq('message_id',location.message_id)
      }
      await clearVerificationLocations(session.user_id,session.id)
      const {error}=await db.from('verif_verification_sessions').delete().eq('id',session.id)
      if(error) throw error
      sessionsExpired++
    } catch(error) { console.error('[verif] expired verification cleanup failed',error instanceof Error?error.message:'unknown error') }
  }
  const {data:due}=await db.from('verif_scheduled_deletes').select('id,chat_id,message_id').lte('delete_at',now).limit(100)
  let messagesDeleted=0
  for(const item of due||[]) {
    await deleteMessage(item.chat_id,item.message_id)
    await db.from('verif_scheduled_deletes').delete().eq('id',item.id)
    messagesDeleted++
  }
  await db.from('verif_message_events').delete().lt('created_at',new Date(Date.now()-7*86400_000).toISOString())
  await db.from('verif_processed_updates').delete().lt('created_at',new Date(Date.now()-86400_000).toISOString())
  return NextResponse.json({ok:true,webhookRegistered,sessionsExpired,messagesDeleted})
}
