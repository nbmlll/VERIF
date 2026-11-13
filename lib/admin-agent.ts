import { db } from './db'
import { interpretAdminCommand } from './ai'
import { langOf, tr } from './i18n'
import { normalizeSettings, updateSetting } from './settings'
import { sendMessage, tg, type TelegramMessage } from './telegram'

const supportedModes=['math','invite','web','join'] as const
export async function handleAdminGroupText(group:{chat_id:number;title:string;language:string;settings:unknown},message:TelegramMessage) {
  const text=message.text?.trim()
  const admin=message.from
  if(!text||!admin||admin.is_bot||text.startsWith('/')) return false
  const intent=await interpretAdminCommand(text)
  const settings=normalizeSettings(group.settings)
  const t=(key:Parameters<typeof tr>[1])=>tr(langOf(group.language),key)
  const update=async (key:Parameters<typeof updateSetting>[1],value:unknown)=>{
    const next=updateSetting(settings,key,value)
    const {error}=await db.from('verif_groups').update({settings:next,updated_at:new Date().toISOString()}).eq('chat_id',group.chat_id)
    if(error) throw error
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
      if(intent.action==='warn') {
        const {data}=await db.from('verif_members').select('warnings').eq('chat_id',group.chat_id).eq('user_id',target.id).maybeSingle()
        await db.from('verif_members').upsert({chat_id:group.chat_id,user_id:target.id,warnings:Number(data?.warnings||0)+1},{onConflict:'chat_id,user_id'})
      } else if(intent.action==='mute') {
        await tg('restrictChatMember',{chat_id:group.chat_id,user_id:target.id,permissions:{can_send_messages:false,can_send_audios:false,can_send_documents:false,can_send_photos:false,can_send_videos:false,can_send_video_notes:false,can_send_voice_notes:false,can_send_polls:false,can_send_other_messages:false,can_add_web_page_previews:false},until_date:Math.floor(Date.now()/1000)+600,use_independent_chat_permissions:true})
      } else if(intent.action==='ban'||intent.action==='kick') {
        await tg('banChatMember',{chat_id:group.chat_id,user_id:target.id,until_date:intent.action==='kick'?Math.floor(Date.now()/1000)+30:undefined,revoke_messages:true})
        if(intent.action==='kick') await tg('unbanChatMember',{chat_id:group.chat_id,user_id:target.id,only_if_banned:true})
      } else await tg('unbanChatMember',{chat_id:group.chat_id,user_id:target.id,only_if_banned:true})
      await db.from('verif_message_events').insert({chat_id:group.chat_id,user_id:admin.id,content_hash:`admin:${intent.action}:${target.id}:${Date.now()}`})
      const actionKey=`${intent.action}Action` as 'warnAction'|'muteAction'|'banAction'|'kickAction'|'unbanAction'
      await sendMessage(group.chat_id,t('actionResult',{action:t(actionKey),name:target.first_name,reason}))
      return true
    }
    default: return false
  }
}
