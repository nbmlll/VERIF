import { createHash } from 'node:crypto'
import { db } from './db'
import { matchConfiguredKeyword } from './ai'
import { langOf, tr } from './i18n'
import { normalizeSettings } from './settings'
import { deleteMessage, sendMessage, tg, type TelegramMessage, userLabel } from './telegram'

type Group={chat_id:number;title:string;language:string;settings:unknown}
async function warn(chatId:number,userId:number,group:Group,reason:string) {
  const {data}=await db.from('verif_members').select('warnings').eq('chat_id',chatId).eq('user_id',userId).maybeSingle()
  const warnings=Number(data?.warnings||0)+1
  await db.from('verif_members').upsert({chat_id:chatId,user_id:userId,warnings},{onConflict:'chat_id,user_id'})
  if(warnings>=3) {
    await tg('restrictChatMember',{chat_id:chatId,user_id:userId,permissions:{can_send_messages:false,can_send_audios:false,can_send_documents:false,can_send_photos:false,can_send_videos:false,can_send_video_notes:false,can_send_voice_notes:false,can_send_polls:false,can_send_other_messages:false,can_add_web_page_previews:false},until_date:Math.floor(Date.now()/1000)+600,use_independent_chat_permissions:true})
    await notify(chatId,group,`${reason} · ${tr(langOf(group.language),'mutedWarning',{count:String(warnings)})}`)
  } else await notify(chatId,group,`${reason} · ${tr(langOf(group.language),'warningCount',{count:String(warnings)})}`)
}
async function notify(chatId:number,group:Group,text:string) {
  const settings=normalizeSettings(group.settings)
  const sent=await sendMessage(chatId,text)
  if(settings.moderation.auto_delete_seconds>0) await db.from('verif_scheduled_deletes').insert({chat_id:chatId,message_id:sent.message_id,delete_at:new Date(Date.now()+settings.moderation.auto_delete_seconds*1000).toISOString()})
}
function hash(text:string) { return createHash('sha256').update(text.trim().toLowerCase()).digest('hex') }
export async function enforceMessage(group:Group,message:TelegramMessage) {
  const user=message.from
  const text=message.text
  if(!user || user.is_bot || !text || text.startsWith('/')) return
  const settings=normalizeSettings(group.settings)
  const t=(key:Parameters<typeof tr>[1])=>tr(langOf(group.language),key)
  await db.from('verif_members').upsert({chat_id:group.chat_id,user_id:user.id,username:user.username||null,display_name:userLabel(user)},{onConflict:'chat_id,user_id',ignoreDuplicates:true})
  const contentHash=hash(text)
  const {error:insertError}=await db.from('verif_message_events').insert({chat_id:group.chat_id,user_id:user.id,content_hash:contentHash})
  if(insertError) throw insertError
  const since=new Date(Date.now()-settings.moderation.flood_window_seconds*1000).toISOString()
  const {count:floodCount}=await db.from('verif_message_events').select('id',{count:'exact',head:true}).eq('chat_id',group.chat_id).eq('user_id',user.id).gte('created_at',since)
  const {count:duplicateCount}=await db.from('verif_message_events').select('id',{count:'exact',head:true}).eq('chat_id',group.chat_id).eq('user_id',user.id).eq('content_hash',contentHash).gte('created_at',since)
  if((floodCount||0)>settings.moderation.flood_limit) {
    await deleteMessage(group.chat_id,message.message_id)
    await warn(group.chat_id,user.id,group,t('floodNotice'))
    return
  }
  if((duplicateCount||0)>=settings.moderation.duplicate_limit) {
    await deleteMessage(group.chat_id,message.message_id)
    await warn(group.chat_id,user.id,group,t('duplicateNotice'))
    return
  }
  if(text.length>settings.moderation.max_message_length) {
    await deleteMessage(group.chat_id,message.message_id)
    await warn(group.chat_id,user.id,group,t('limitLength'))
    return
  }
  const keywords=settings.moderation.keywords
  if(keywords.length) {
    const mode=settings.moderation.keyword_mode
    let match=mode==='off' ? null : keywords.find((keyword)=>keyword && text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()))||null
    if(!match && mode==='ai') {
      try { match=await matchConfiguredKeyword(text,keywords) } catch { match=null }
    }
    if(match) {
      const action=settings.moderation.keyword_action
      if(action==='delete') await deleteMessage(group.chat_id,message.message_id)
      if(action==='warn') { await deleteMessage(group.chat_id,message.message_id); await warn(group.chat_id,user.id,group,t('keywordNotice')) }
      if(action==='mute') {
        await deleteMessage(group.chat_id,message.message_id)
        await tg('restrictChatMember',{chat_id:group.chat_id,user_id:user.id,permissions:{can_send_messages:false,can_send_audios:false,can_send_documents:false,can_send_photos:false,can_send_videos:false,can_send_video_notes:false,can_send_voice_notes:false,can_send_polls:false,can_send_other_messages:false,can_add_web_page_previews:false},until_date:Math.floor(Date.now()/1000)+600,use_independent_chat_permissions:true})
      }
      if(action!=='delete') await notify(group.chat_id,group,`${t('keywordNotice')} “${match.slice(0,60)}”`)
    }
  }
}
export async function welcomeMember(group:Group,user:{id:number;first_name:string;last_name?:string}) {
  const settings=normalizeSettings(group.settings)
  if(!settings.moderation.welcome_enabled) return
  const text=settings.moderation.welcome_text.replaceAll('{name}',[user.first_name,user.last_name].filter(Boolean).join(' ')).slice(0,800)
  const rules=settings.moderation.rules
  const keyboard=rules ? {inline_keyboard:[[{text:tr(langOf(group.language),'rulesButton'),callback_data:'rules'}]]} : undefined
  const sent=await sendMessage(group.chat_id,text,keyboard)
  if(settings.moderation.auto_delete_seconds>0) await db.from('verif_scheduled_deletes').insert({chat_id:group.chat_id,message_id:sent.message_id,delete_at:new Date(Date.now()+settings.moderation.auto_delete_seconds*1000).toISOString()})
}
