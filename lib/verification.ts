import { db } from './db'
import { getGroup, getVerificationLocations, setVerificationLocation, clearVerificationLocations } from './panel'
import { langOf, tr } from './i18n'
import { normalizeSettings } from './settings'
import { deleteMessage, sendMessage, tg, userLabel, type TelegramUser } from './telegram'

export type VerificationSession={id:string;chat_id:number;user_id:number;mode:'math'|'invite'|'web'|'join';challenge:string;expected_answer:string;expires_at:string;prompt_message_id:number|null}
type Group={chat_id:number;title:string;language:string;settings:unknown}
type MessageLocation={chat_id:number;message_id:number}

function escapeHtml(value:string) {
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
}
function mention(user:TelegramUser) {
  return `<a href="tg://user?id=${user.id}">${escapeHtml(userLabel(user))}</a>`
}
async function scheduleDelete(chatId:number,messageId:number,seconds:number) {
  if(seconds<=0) return
  const {error}=await db.from('verif_scheduled_deletes').insert({chat_id:chatId,message_id:messageId,delete_at:new Date(Date.now()+seconds*1000).toISOString()})
  if(error) console.error('[verif] could not schedule message deletion',error.message)
}
async function removeScheduledDelete(location:MessageLocation) {
  const {error}=await db.from('verif_scheduled_deletes').delete().eq('chat_id',location.chat_id).eq('message_id',location.message_id)
  if(error) console.error('[verif] could not remove scheduled message deletion',error.message)
}

export function isPrivateDeliveryUnavailable(error:unknown) {
  return error instanceof Error&&/(can't initiate conversation|chat not found|bot was blocked by the user|user is deactivated)/i.test(error.message)
}

export async function sendPrivateVerificationPrompt(session:VerificationSession,userId:number,group:Group,origin:string) {
  const current=await getVerificationLocations(userId,session.id)
  if(current.prompt?.chat_id===userId) return current.prompt
  const lang=langOf(group.language)
  let text=tr(lang,'verificationRequired')
  let markup:{inline_keyboard:{text:string;callback_data?:string;url?:string}[][]}
  if(session.mode==='math') {
    const correct=Number(session.expected_answer)
    const options=[correct,correct+1,Math.max(0,correct-1),correct+2].sort(()=>Math.random()-.5)
    text+=`\n${tr(lang,'challenge')} ${session.challenge}`
    markup={inline_keyboard:[options.map((value)=>({text:String(value),callback_data:`ver:${session.id}:${value}`}))]}
  } else if(session.mode==='web') {
    const url=new URL('/verify',origin)
    url.searchParams.set('id',session.id)
    markup={inline_keyboard:[[{text:tr(lang,'webButton'),url:url.toString()}]]}
  } else if(session.mode==='invite') {
    const groupSettingsValue=normalizeSettings(group.settings)
    text+=`\n${tr(lang,'invitePrompt',{count:String(groupSettingsValue.verification.required_invites)})}`
    markup={inline_keyboard:[[{text:tr(lang,'checkInvitations'),callback_data:`ver:${session.id}:check`}]]}
  } else {
    text+=`\n${tr(lang,'challenge')} ${session.challenge}`
    markup={inline_keyboard:[[{text:tr(lang,'checkChannel'),callback_data:`ver:${session.id}:check`}]]}
  }
  const sent=await sendMessage(userId,text,markup)
  const {error}=await db.from('verif_verification_sessions').update({prompt_message_id:sent.message_id}).eq('id',session.id)
  if(error) throw error
  const location={chat_id:userId,message_id:sent.message_id}
  await setVerificationLocation(userId,session.id,'prompt',location)
  return location
}

export async function sendGroupVerificationLink(session:VerificationSession,user:TelegramUser,group:Group,botUsername:string,kind:'prompt'|'notice') {
  const url=`https://t.me/${botUsername}?start=verify_${session.id}`
  const text=`${mention(user)}, ${tr(langOf(group.language),'verificationRequired')}`
  const sent=await sendMessage(group.chat_id,text,{inline_keyboard:[[{text:tr(langOf(group.language),'openVerification'),url}]]},{parse_mode:'HTML'})
  const location={chat_id:group.chat_id,message_id:sent.message_id}
  await setVerificationLocation(user.id,session.id,kind,location)
  if(kind==='prompt') {
    const {error}=await db.from('verif_verification_sessions').update({prompt_message_id:sent.message_id}).eq('id',session.id)
    if(error) throw error
  }
  await scheduleDelete(group.chat_id,sent.message_id,normalizeSettings(group.settings).moderation.auto_delete_seconds)
  return location
}

export async function publishVerificationSuccess(input:{session:VerificationSession;user:TelegramUser;language:string;legacyPromptMessageId?:number|null}) {
  const {session,user}=input
  const locations=await getVerificationLocations(user.id,session.id)
  const prompt=locations.prompt||(input.legacyPromptMessageId?{chat_id:session.chat_id,message_id:input.legacyPromptMessageId}:undefined)
  if(prompt) {
    if(prompt.chat_id===session.chat_id) await deleteMessage(prompt.chat_id,prompt.message_id)
    else {
      try { await tg('editMessageText',{chat_id:prompt.chat_id,message_id:prompt.message_id,text:tr(langOf(input.language),'verified'),reply_markup:{inline_keyboard:[]}}) } catch {}
    }
    if(prompt.chat_id!==user.id) await removeScheduledDelete(prompt)
  }
  if(locations.notice) {
    await deleteMessage(locations.notice.chat_id,locations.notice.message_id)
    await removeScheduledDelete(locations.notice)
  }
  const group=await getGroup(session.chat_id)
  if(group) {
    try {
      const sent=await sendMessage(session.chat_id,`${mention(user)}, ${tr(langOf(input.language),'verified')}`,undefined,{parse_mode:'HTML'})
      await scheduleDelete(session.chat_id,sent.message_id,normalizeSettings(group.settings).moderation.auto_delete_seconds)
    } catch(error) {
      console.error('[verif] verified-member announcement failed',error instanceof Error?error.message:'unknown error')
    }
  }
  await clearVerificationLocations(user.id,session.id)
}
