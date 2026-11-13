import { randomUUID } from 'node:crypto'
import { db } from './db'
import { interpretAdminCommand } from './ai'
import { langOf, tr } from './i18n'
import { normalizeSettings, updateSetting } from './settings'
import { getGroup, getUi, isAdmin, setUiData, updateGroupSettings } from './panel'
import { sendMessage, tg, type TelegramMessage, type TelegramUpdate } from './telegram'

const supportedModes=['math','invite','web','join'] as const
type PendingAction={token:string;chat_id:number;target_id:number;target_name:string;action:'mute'|'ban'|'kick';reason:string;expires_at:number}
function isPendingAction(value:unknown):value is PendingAction {
  if(!value||typeof value!=='object') return false
  const action=value as Record<string,unknown>
  return typeof action.token==='string'&&typeof action.chat_id==='number'&&typeof action.target_id==='number'&&typeof action.target_name==='string'&&['mute','ban','kick'].includes(String(action.action))&&typeof action.reason==='string'&&typeof action.expires_at==='number'
}
export async function handleActionConfirmation(update:TelegramUpdate) {
  const query=update.callback_query
  const match=query?.data?.match(/^action-confirm:([0-9a-f-]{36}):(yes|no)$/i)
  if(!query?.message||!match) return false
  const chatId=query.message.chat.id
  const group=await getGroup(chatId)
  const lang=langOf(group?.language)
  if(!group||!(await isAdmin(chatId,query.from.id))) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:tr(lang,'adminOnly'),show_alert:true})
    return true
  }
  const ui=await getUi(query.from.id)
  const pending=ui.state.pending_action
  if(!isPendingAction(pending)||pending.token!==match[1]||pending.chat_id!==chatId||pending.expires_at<Date.now()) {
    if(isPendingAction(pending)&&pending.token===match[1]&&pending.expires_at<Date.now()) await setUiData(query.from.id,{pending_action:null})
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:tr(lang,'confirmExpired'),show_alert:true})
    return true
  }
  if(match[2]==='no') {
    await setUiData(query.from.id,{pending_action:null})
    await tg('answerCallbackQuery',{callback_query_id:query.id})
    await tg('editMessageText',{chat_id:chatId,message_id:query.message.message_id,text:tr(lang,'actionCancelled'),reply_markup:{inline_keyboard:[]}})
    return true
  }
  let botMember:{status:string;can_restrict_members?:boolean}
  let targetMember:{status:string}
  try {
    const bot=await tg<{id:number}>('getMe')
    ;[botMember,targetMember]=await Promise.all([
      tg<{status:string;can_restrict_members?:boolean}>('getChatMember',{chat_id:chatId,user_id:bot.id}),
      tg<{status:string}>('getChatMember',{chat_id:chatId,user_id:pending.target_id}),
    ])
  } catch {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:tr(lang,'actionFailed'),show_alert:true})
    return true
  }
  if(botMember.status!=='administrator'||!botMember.can_restrict_members) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:tr(lang,'actionFailed'),show_alert:true})
    return true
  }
  if(targetMember.status==='administrator'||targetMember.status==='creator') {
    await setUiData(query.from.id,{pending_action:null})
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:tr(lang,'actionFailed'),show_alert:true})
    await tg('editMessageText',{chat_id:chatId,message_id:query.message.message_id,text:tr(lang,'actionFailed'),reply_markup:{inline_keyboard:[]}})
    return true
  }
  await setUiData(query.from.id,{pending_action:null})
  await tg('answerCallbackQuery',{callback_query_id:query.id})
  try {
    if(pending.action==='mute') await tg('restrictChatMember',{chat_id:chatId,user_id:pending.target_id,permissions:{can_send_messages:false,can_send_audios:false,can_send_documents:false,can_send_photos:false,can_send_videos:false,can_send_video_notes:false,can_send_voice_notes:false,can_send_polls:false,can_send_other_messages:false,can_add_web_page_previews:false},until_date:Math.floor(Date.now()/1000)+600,use_independent_chat_permissions:true})
    else {
      await tg('banChatMember',{chat_id:chatId,user_id:pending.target_id,until_date:pending.action==='kick'?Math.floor(Date.now()/1000)+30:undefined,revoke_messages:false})
      if(pending.action==='kick') await tg('unbanChatMember',{chat_id:chatId,user_id:pending.target_id,only_if_banned:true})
    }
    const {error:auditError}=await db.from('verif_action_audit').insert({chat_id:chatId,actor_id:query.from.id,action:pending.action,details:{target_id:pending.target_id,reason:pending.reason},outcome:'success'})
    if(auditError) console.error('[verif] action audit insert failed',auditError.message)
    const actionKey=`${pending.action}Action` as 'muteAction'|'banAction'|'kickAction'
    await tg('editMessageText',{chat_id:chatId,message_id:query.message.message_id,text:tr(lang,'actionResult',{action:tr(lang,actionKey),name:pending.target_name,reason:pending.reason}),reply_markup:{inline_keyboard:[]}})
  } catch(error) {
    console.error('[verif] confirmed moderation action failed',error instanceof Error?error.message:'unknown error')
    await tg('editMessageText',{chat_id:chatId,message_id:query.message.message_id,text:tr(lang,'actionFailed'),reply_markup:{inline_keyboard:[]}})
  }
  return true
}
export async function handleAdminGroupText(group:{chat_id:number;title:string;language:string;settings:unknown},message:TelegramMessage) {
  const text=message.text?.trim()
  const admin=message.from
  if(!text||!admin||admin.is_bot||text.startsWith('/')) return false
  const intent=await interpretAdminCommand(text)
  const settings=normalizeSettings(group.settings)
  const t=(key:Parameters<typeof tr>[1],vars?:Record<string,string>)=>tr(langOf(group.language),key,vars)
  const update=async (key:Parameters<typeof updateSetting>[1],value:unknown)=>{
    const next=updateSetting(settings,key,value)
    await updateGroupSettings(group.chat_id,next)
    await sendMessage(group.chat_id,t('updated'))
    return true
  }
  switch(intent.action) {
    case 'set_message_length': {
      const value=Number(intent.value)
      if(!Number.isInteger(value)||value<100||value>10000) return false
      return update('max_message_length',value)
    }
    case 'set_flood_limit': {
      const value=Number(intent.value)
      if(!Number.isInteger(value)||value<2||value>100) return false
      return update('flood_limit',value)
    }
    case 'set_welcome': return typeof intent.value==='string' ? update('welcome_text',intent.value) : false
    case 'set_rules': return typeof intent.value==='string' ? update('rules',intent.value) : false
    case 'set_keyword': return typeof intent.value==='string' ? update('keywords',intent.value.split(',').map((s)=>s.trim()).filter(Boolean)) : false
    case 'set_verification_mode': return typeof intent.value==='string'&&supportedModes.includes(intent.value as typeof supportedModes[number]) ? update('mode',intent.value) : false
    case 'show_rules':
      if(settings.moderation.rules) await sendMessage(group.chat_id,settings.moderation.rules)
      else await sendMessage(group.chat_id,t('rulesButton'))
      return true
    case 'warn': case 'mute': case 'ban': case 'kick': case 'unban': {
      const target=message.reply_to_message?.from
      if(!target||target.is_bot||!message.reply_to_message) return false
      const member=await tg<{status:string}>('getChatMember',{chat_id:group.chat_id,user_id:target.id})
      if(member.status==='administrator'||member.status==='creator') return false
      const reason=(intent.reason||t('defaultReason')).slice(0,250)
      if(intent.action==='mute'||intent.action==='ban'||intent.action==='kick') {
        const token=randomUUID()
        await setUiData(admin.id,{pending_action:{token,chat_id:group.chat_id,target_id:target.id,target_name:target.first_name,action:intent.action,reason,expires_at:Date.now()+120_000}})
        const actionKey=`${intent.action}Action` as 'muteAction'|'banAction'|'kickAction'
        await sendMessage(group.chat_id,t('confirmAction',{action:t(actionKey),name:target.first_name}),{inline_keyboard:[[{text:t('confirmButton'),callback_data:`action-confirm:${token}:yes`},{text:t('cancelButton'),callback_data:`action-confirm:${token}:no`}]]})
        return true
      }
      if(intent.action==='warn') {
        const {data}=await db.from('verif_members').select('warnings').eq('chat_id',group.chat_id).eq('telegram_user_id',target.id).maybeSingle()
        await db.from('verif_members').upsert({chat_id:group.chat_id,telegram_user_id:target.id,warnings:Number(data?.warnings||0)+1},{onConflict:'chat_id,telegram_user_id'})
      } else if(intent.action==='unban') await tg('unbanChatMember',{chat_id:group.chat_id,user_id:target.id,only_if_banned:true})
      await db.from('verif_message_events').insert({chat_id:group.chat_id,user_id:admin.id,content_hash:`admin:${intent.action}:${target.id}:${Date.now()}`})
      const actionKey=`${intent.action}Action` as 'warnAction'|'muteAction'|'banAction'|'kickAction'|'unbanAction'
      await sendMessage(group.chat_id,t('actionResult',{action:t(actionKey),name:target.first_name,reason}))
      return true
    }
    default: return false
  }
}
