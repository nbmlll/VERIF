import { randomUUID } from 'node:crypto'
import { interpretAdminCommand } from './ai'
import { createLiveCapabilityActionService } from './capability-action-runtime'
import { langOf, tr } from './i18n'
import { normalizeSettings } from './settings'
import { getGroup, getUi, isAdmin, setUiData, updateGroupSettings } from './panel'
import { sendMessage, tg, type TelegramMessage, type TelegramUpdate } from './telegram'

type PendingAction={token:string;chat_id:number;target_id:number;target_name:string;action:'mute'|'ban'|'kick';reason:string;expires_at:number}
function isPendingAction(value:unknown):value is PendingAction {
  if(!value||typeof value!=='object') return false
  const action=value as Record<string,unknown>
  return typeof action.token==='string'&&typeof action.chat_id==='number'&&typeof action.target_id==='number'&&typeof action.target_name==='string'&&['mute','ban','kick'].includes(String(action.action))&&typeof action.reason==='string'&&typeof action.expires_at==='number'
}

const capabilityActions=createLiveCapabilityActionService({getGroup,updateGroupSettings})
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

  await setUiData(query.from.id,{pending_action:null})
  await tg('answerCallbackQuery',{callback_query_id:query.id})
  const result=await capabilityActions.executeMemberAction({
    chatId,
    actorId:query.from.id,
    targetUserId:pending.target_id,
    action:pending.action,
    confirmationToken:pending.token,
    reason:pending.reason,
  })
  const actionKey=`${pending.action}Action` as 'muteAction'|'banAction'|'kickAction'
  const resultText=result.status==='success'
    ? tr(lang,'actionResult',{action:tr(lang,actionKey),name:pending.target_name,reason:pending.reason})
    : ['action_failed','state_unverified','audit_finalize_failed','already_processed'].includes(result.status)
      ? tr(lang,'actionNeedsReview')
      : tr(lang,'actionFailed')
  await tg('editMessageText',{chat_id:chatId,message_id:query.message.message_id,text:resultText,reply_markup:{inline_keyboard:[]}})
  return true
}
export async function handleAdminGroupText(group:{chat_id:number;title:string;language:string;settings:unknown},message:TelegramMessage) {
  const text=message.text?.trim()
  const admin=message.from
  if(!text||!admin||admin.is_bot||text.startsWith('/')) return false
  const intent=await interpretAdminCommand(text)
  const settings=normalizeSettings(group.settings)
  const lang=langOf(group.language)
  const t=(key:Parameters<typeof tr>[1],vars?:Record<string,string>)=>tr(lang,key,vars)
  const eventToken=`telegram-message:${group.chat_id}:${message.message_id}`
  const update=async(action:'set_message_length'|'set_flood_limit'|'set_flood_window'|'set_duplicate_limit'|'set_welcome_enabled'|'set_welcome'|'set_rules'|'set_keyword'|'set_keyword_mode'|'set_keyword_action'|'set_auto_delete'|'set_verification_enabled'|'set_verification_trigger'|'set_verification_mode'|'set_verification_timeout'|'set_required_invites'|'set_web_enabled'|'set_join_chat',value:unknown)=>{
    const result=await capabilityActions.executeSetting({chatId:group.chat_id,actorId:admin.id,eventToken,action,value})
    if(result.status==='success') await sendMessage(group.chat_id,t('updated'))
    else if(result.status==='invalid_input') await sendMessage(group.chat_id,t('invalid'))
    else if(result.status==='already_processed') return true
    else if(result.status==='admin_required') await sendMessage(group.chat_id,t('adminOnly'))
    else if(['action_failed','state_unverified','audit_finalize_failed'].includes(result.status)) await sendMessage(group.chat_id,t('actionNeedsReview'))
    else await sendMessage(group.chat_id,t('actionFailed'))
    return true
  }
  switch(intent.action) {
    case 'set_message_length': return update('set_message_length',intent.value)
    case 'set_flood_limit': return update('set_flood_limit',intent.value)
    case 'set_flood_window': return update('set_flood_window',intent.value)
    case 'set_duplicate_limit': return update('set_duplicate_limit',intent.value)
    case 'set_welcome_enabled': return update('set_welcome_enabled',intent.value)
    case 'set_welcome': return update('set_welcome',intent.value)
    case 'set_rules': return update('set_rules',intent.value)
    case 'set_keyword': return update('set_keyword',intent.value)
    case 'set_keyword_mode': return update('set_keyword_mode',intent.value)
    case 'set_keyword_action': return update('set_keyword_action',intent.value)
    case 'set_auto_delete': return update('set_auto_delete',intent.value)
    case 'set_verification_enabled': return update('set_verification_enabled',intent.value)
    case 'set_verification_trigger': return update('set_verification_trigger',intent.value)
    case 'set_verification_mode': return update('set_verification_mode',intent.value)
    case 'set_verification_timeout': return update('set_verification_timeout',intent.value)
    case 'set_required_invites': return update('set_required_invites',intent.value)
    case 'set_web_enabled': return update('set_web_enabled',intent.value)
    case 'set_join_chat': return update('set_join_chat',intent.value)
    case 'show_rules':
      if(settings.moderation.rules) await sendMessage(group.chat_id,settings.moderation.rules)
      else await sendMessage(group.chat_id,t('rulesButton'))
      return true
    case 'warn': case 'mute': case 'ban': case 'kick': case 'unban': {
      const target=message.reply_to_message?.from
      if(!target||target.is_bot||!message.reply_to_message) return false
      const reason=(intent.reason||t('defaultReason')).slice(0,250)
      if(intent.action==='mute'||intent.action==='ban'||intent.action==='kick') {
        const member=await tg<{status:string}>('getChatMember',{chat_id:group.chat_id,user_id:target.id})
        if(member.status==='administrator'||member.status==='creator') {
          await sendMessage(group.chat_id,t('actionFailed'))
          return true
        }
        const token=randomUUID()
        await setUiData(admin.id,{pending_action:{token,chat_id:group.chat_id,target_id:target.id,target_name:target.first_name,action:intent.action,reason,expires_at:Date.now()+120_000}})
        const actionKey=`${intent.action}Action` as 'muteAction'|'banAction'|'kickAction'
        await sendMessage(group.chat_id,t('confirmAction',{action:t(actionKey),name:target.first_name}),{inline_keyboard:[[{text:t('confirmButton'),callback_data:`action-confirm:${token}:yes`},{text:t('cancelButton'),callback_data:`action-confirm:${token}:no`}]]})
        return true
      }
      const result=await capabilityActions.executeMemberAction({chatId:group.chat_id,actorId:admin.id,targetUserId:target.id,action:intent.action,eventToken,reason})
      if(result.status==='already_processed') return true
      if(result.status==='success') {
        const actionKey=`${intent.action}Action` as 'warnAction'|'unbanAction'
        await sendMessage(group.chat_id,t('actionResult',{action:t(actionKey),name:target.first_name,reason}))
      } else if(['action_failed','state_unverified','audit_finalize_failed'].includes(result.status)) await sendMessage(group.chat_id,t('actionNeedsReview'))
      else if(result.status==='admin_required') await sendMessage(group.chat_id,t('adminOnly'))
      else await sendMessage(group.chat_id,t('actionFailed'))
      return true
    }
    default: return false
  }
}
