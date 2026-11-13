import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handleAdminGroupText } from '@/lib/admin-agent'
import { langOf, tr } from '@/lib/i18n'
import { getGroup, groupSettings, handlePanelCallback, handlePrivateText, isAdmin, startPanel } from '@/lib/panel'
import { enforceMessage, welcomeMember } from '@/lib/moderation'
import { defaults, normalizeSettings } from '@/lib/settings'
import { deleteMessage, isTelegramAdmin, sendMessage, tg, userLabel, type InlineKeyboard, type TelegramMessage, type TelegramUpdate } from '@/lib/telegram'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const botToken=process.env.TELEGRAM_BOT_TOKEN!
const webhookSecret=createHash('sha256').update(`${botToken}:verif-webhook`).digest('hex')
const validSecret=(provided:string|null) => {
  if(!provided) return false
  const left=Buffer.from(provided), right=Buffer.from(webhookSecret)
  return left.length===right.length && timingSafeEqual(left,right)
}

async function ensureGroup(chatId:number,title:string) {
  const existing=await getGroup(chatId)
  if(existing) {
    if(title && title!==existing.title) await db.from('verif_groups').update({title,updated_at:new Date().toISOString()}).eq('chat_id',chatId)
    return existing
  }
  const {error}=await db.from('verif_groups').insert({chat_id:chatId,title:title||'Telegram group',settings:defaults,language:'en'})
  if(error && error.code!=='23505') throw error
  return getGroup(chatId)
}
async function registerAdmin(chatId:number,userId:number,username?:string) {
  if(!(await isTelegramAdmin(chatId,userId))) return false
  const {error}=await db.from('verif_group_admins').upsert({chat_id:chatId,user_id:userId,username:username||null},{onConflict:'chat_id,user_id'})
  if(error) throw error
  return true
}
function appUrl(request:NextRequest) {
  const configured=process.env.APP_URL
  if(configured) return configured.replace(/\/$/,'')
  const vercel=process.env.VERCEL_URL
  return vercel ? `https://${vercel}` : new URL(request.url).origin
}

async function beginVerification(chatId:number,user:{id:number;first_name:string;last_name?:string},request:NextRequest) {
  const group=await getGroup(chatId)
  if(!group) return
  const settings=groupSettings(group)
  if(!settings.verification.enabled) {
    await db.from('verif_members').upsert({chat_id:chatId,user_id:user.id,display_name:userLabel(user),verified_at:new Date().toISOString()},{onConflict:'chat_id,user_id'})
    return
  }
  let mode=settings.verification.mode
  if(mode==='web'&&!settings.verification.web_enabled) mode='math'
  if(mode==='join'&&!settings.verification.join_chat_id) mode='math'
  const a=2+Math.floor(Math.random()*8), b=2+Math.floor(Math.random()*8)
  const challenge=mode==='math'?`${a} + ${b}`:mode==='join'?settings.verification.join_chat_id:mode==='invite'?String(settings.verification.required_invites):'web'
  const answer=mode==='math'?String(a+b):mode
  const expiry=new Date(Date.now()+settings.verification.timeout_seconds*1000).toISOString()
  const {data,error}=await db.from('verif_verification_sessions').upsert({chat_id:chatId,user_id:user.id,mode,challenge,expected_answer:answer,expires_at:expiry},{onConflict:'chat_id,user_id'}).select('id').single()
  if(error||!data) throw error||new Error('Could not create verification session')
  await db.from('verif_members').upsert({chat_id:chatId,user_id:user.id,display_name:userLabel(user),username:'username' in user?user.username||null:null,verified_at:null},{onConflict:'chat_id,user_id'})
  try {
    await tg('restrictChatMember',{chat_id:chatId,user_id:user.id,permissions:{can_send_messages:false,can_send_audios:false,can_send_documents:false,can_send_photos:false,can_send_videos:false,can_send_video_notes:false,can_send_voice_notes:false,can_send_polls:false,can_send_other_messages:false,can_add_web_page_previews:false},use_independent_chat_permissions:true})
  } catch(error) {
    await db.from('verif_verification_sessions').delete().eq('id',data.id)
    throw error
  }
  const lang=langOf(group.language)
  let markup:InlineKeyboard
  let text=`${tr(lang,'verificationRequired')}\n${tr(lang,'challenge')} ${challenge}`
  if(mode==='math') {
    const correct=a+b
    const options=[correct,correct+1,Math.max(0,correct-1),correct+2].sort(()=>Math.random()-.5)
    markup={inline_keyboard:[options.map((value)=>({text:String(value),callback_data:`ver:${data.id}:${value}`}))]}
  } else if(mode==='web') {
    markup={inline_keyboard:[[{text:tr(lang,'webButton'),url:`${appUrl(request)}/verify?id=${encodeURIComponent(data.id)}`}]]}
  } else if(mode==='invite') {
    text+=`\n${tr(lang,'invitePrompt',{count:String(settings.verification.required_invites)})}`
    markup={inline_keyboard:[[{text:tr(lang,'checkInvitations'),callback_data:`ver:${data.id}:check`}]]}
  } else {
    markup={inline_keyboard:[[{text:tr(lang,'checkChannel'),callback_data:`ver:${data.id}:check`}]]}
  }
  const sent=await sendMessage(chatId,text,markup,{reply_to_message_id:undefined})
  await db.from('verif_verification_sessions').update({prompt_message_id:sent.message_id}).eq('id',data.id)
}

async function completeVerification(update:TelegramUpdate) {
  const query=update.callback_query!
  const [_,id,answer]=String(query.data||'').split(':')
  if(!query.message || !id) return
  const languageGroup=await getGroup(query.message.chat.id)
  const {data:session}=await db.from('verif_verification_sessions').select('id,chat_id,user_id,mode,challenge,expected_answer,expires_at,prompt_message_id').eq('id',id).maybeSingle()
  if(!session || session.user_id!==query.from.id || session.chat_id!==query.message.chat.id) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:tr(langOf(languageGroup?.language),'notYourCheck'),show_alert:true}); return
  }
  const group=await getGroup(session.chat_id)
  if(!group) return
  if(new Date(session.expires_at).getTime()<Date.now()) {
    await db.from('verif_verification_sessions').delete().eq('id',session.id)
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:tr(langOf(group.language),'expired'),show_alert:true}); return
  }
  let valid=false
  if(session.mode==='math') valid=answer===session.expected_answer
  if(session.mode==='invite'&&answer==='check') {
    const {count}=await db.from('verif_join_invites').select('invitee_id',{count:'exact',head:true}).eq('chat_id',session.chat_id).eq('inviter_id',session.user_id)
    valid=(count||0)>=Number(session.expected_answer)
  }
  if(session.mode==='join'&&answer==='check') {
    try {
      const member=await tg<{status:string}>('getChatMember',{chat_id:session.challenge,user_id:session.user_id})
      valid=!['left','kicked'].includes(member.status)
    } catch { valid=false }
  }
  if(!valid) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:tr(langOf(group.language),'wrong'),show_alert:true}); return
  }
  await tg('restrictChatMember',{chat_id:session.chat_id,user_id:session.user_id,permissions:{can_send_messages:true,can_send_audios:true,can_send_documents:true,can_send_photos:true,can_send_videos:true,can_send_video_notes:true,can_send_voice_notes:true,can_send_polls:true,can_send_other_messages:true,can_add_web_page_previews:true},use_independent_chat_permissions:true})
  await db.from('verif_members').upsert({chat_id:session.chat_id,user_id:session.user_id,verified_at:new Date().toISOString()},{onConflict:'chat_id,user_id'})
  await db.from('verif_verification_sessions').delete().eq('id',session.id)
  await tg('answerCallbackQuery',{callback_query_id:query.id,text:tr(langOf(group.language),'verified')})
  try { await tg('editMessageText',{chat_id:session.chat_id,message_id:session.prompt_message_id||query.message.message_id,text:tr(langOf(group.language),'verified')}) } catch { await deleteMessage(session.chat_id,session.prompt_message_id||query.message.message_id) }
}

async function processGroupMessage(message:TelegramMessage,request:NextRequest) {
  const chat=message.chat
  if(!['group','supergroup'].includes(chat.type)) return
  const group=await ensureGroup(chat.id,chat.title||'Telegram group')
  if(!group) return
  const text=message.text?.trim()
  const sender=message.from
  if(!text||!sender) return
  if(/^\/(settings|start)(?:@\w+)?(?:\s|$)/i.test(text)) {
    if(!(await registerAdmin(chat.id,sender.id,sender.username))) return
    const username=await tg<{username:string}>('getMe').then((me)=>me.username)
    await sendMessage(chat.id,tr(langOf(group.language),'setup'),{inline_keyboard:[[{text:tr(langOf(group.language),'open'),url:`https://t.me/${username}?start=cfg_${chat.id}`}]]})
    return
  }
  if(/^\/rules(?:@\w+)?(?:\s|$)/i.test(text)) {
    if(groupSettings(group).moderation.rules) await sendMessage(chat.id,groupSettings(group).moderation.rules)
    else await sendMessage(chat.id,tr(langOf(group.language),'rulesButton'))
    return
  }
  if(/^\/help(?:@\w+)?(?:\s|$)/i.test(text)) {
    await sendMessage(chat.id,tr(langOf(group.language),'groupHelp'))
    return
  }
  if(sender.is_bot) return
  if(await isTelegramAdmin(chat.id,sender.id)) {
    await registerAdmin(chat.id,sender.id,sender.username)
    try { await handleAdminGroupText(group,message) } catch(error) { console.error('[verif] group command failed',error instanceof Error?error.message:'unknown error') }
    return
  }
  try { await enforceMessage(group,message) } catch(error) { console.error('[verif] moderation failed',error instanceof Error?error.message:'unknown error') }
}

async function processChatMember(update:NonNullable<TelegramUpdate['chat_member']>,request:NextRequest) {
  if(!['group','supergroup'].includes(update.chat.type)) return
  await ensureGroup(update.chat.id,update.chat.title||'Telegram group')
  const oldStatus=update.old_chat_member.status
  const status=update.new_chat_member.status
  const user=update.new_chat_member.user
  if(!['left','kicked'].includes(oldStatus)&&['left','kicked'].includes(status)) {
    await db.from('verif_members').delete().eq('chat_id',update.chat.id).eq('user_id',user.id)
    await db.from('verif_verification_sessions').delete().eq('chat_id',update.chat.id).eq('user_id',user.id)
  }
  if(['left','kicked'].includes(oldStatus)&&['member','restricted','administrator','creator'].includes(status)) {
    const inviter=update.invite_link?.creator
    if(inviter&&inviter.id!==user.id) await db.from('verif_join_invites').upsert({chat_id:update.chat.id,invitee_id:user.id,inviter_id:inviter.id},{onConflict:'chat_id,invitee_id'})
    if(!user.is_bot) {
      await beginVerification(update.chat.id,user,request)
      const group=await getGroup(update.chat.id)
      if(group) await welcomeMember(group,user)
    }
  }
}

async function processUpdate(update:TelegramUpdate,request:NextRequest) {
  if(update.my_chat_member) {
    const {chat,from,new_chat_member}=update.my_chat_member
    if(['group','supergroup'].includes(chat.type)&&!['left','kicked'].includes(new_chat_member.status)) {
      await ensureGroup(chat.id,chat.title||'Telegram group')
      if(await isTelegramAdmin(chat.id,from.id)) await registerAdmin(chat.id,from.id,from.username)
    }
  }
  if(update.chat_member) await processChatMember(update.chat_member,request)
  if(update.message?.chat.type==='private') {
    const message=update.message
    if(message.text?.startsWith('/start')) {
      const payload=message.text.split(/\s+/,2)[1]
      await startPanel(message.from!.id,message.chat.id,payload)
    } else if(message.from&&message.text) {
      await handlePrivateText(message.from.id,message.message_id,message.text)
    }
  } else if(update.message) await processGroupMessage(update.message,request)
  if(update.callback_query?.data?.startsWith('ver:')) await completeVerification(update)
  else if(update.callback_query?.data==='rules') {
    const query=update.callback_query
    const target=query.message
    if(!target) return
    const group=await getGroup(target.chat.id)
    const rules=group?groupSettings(group).moderation.rules:''
    await tg('answerCallbackQuery',{callback_query_id:query.id})
    try { await tg('editMessageText',{chat_id:target.chat.id,message_id:target.message_id,text:rules||tr(langOf(group?.language),'rulesButton')}) } catch {}
  } else if(update.callback_query?.message?.chat.type==='private' && update.callback_query.data) {
    await handlePanelCallback(update.callback_query.from.id,update.callback_query.id,update.callback_query.message.message_id,update.callback_query.data)
  } else if(update.callback_query) await tg('answerCallbackQuery',{callback_query_id:update.callback_query.id})
}

export async function GET() {
  return NextResponse.json({ok:true,service:'VERIF Telegram webhook',setup:'Webhook registration is performed by the authenticated scheduled maintenance job.'})
}

export async function POST(request:NextRequest) {
  if(!validSecret(request.headers.get('x-telegram-bot-api-secret-token'))) return NextResponse.json({ok:false}, {status:401})
  let update:TelegramUpdate
  try { update=await request.json() as TelegramUpdate } catch { return NextResponse.json({ok:false},{status:400}) }
  const {error:claimError}=await db.from('verif_processed_updates').insert({update_id:update.update_id})
  if(claimError?.code==='23505') return NextResponse.json({ok:true,duplicate:true})
  if(claimError) return NextResponse.json({ok:false},{status:503})
  try {
    await processUpdate(update,request)
    return NextResponse.json({ok:true})
  } catch(error) {
    await db.from('verif_processed_updates').delete().eq('update_id',update.update_id)
    console.error('[verif] webhook update failed',error instanceof Error?error.message:'unknown error')
    return NextResponse.json({ok:false},{status:500})
  }
}
