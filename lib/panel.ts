import { db } from './db'
import { langOf, tr, languageName, type Language, type MessageKey } from './i18n'
import { defaults, fields, normalizeSettings, sectionFields, type BotSettings, type Field, type Section, updateSetting } from './settings'
import { deleteMessage, editMessage, InlineButton, InlineKeyboard, sendMessage, tg } from './telegram'

export type UiState = { user_id:number; chat_id:number | null; message_id:number | null; edit_key:string | null; language:Language }
type GroupRow = { chat_id:number; title:string; language:Language; settings:unknown }
type Screen = 'home' | Section | 'language' | 'field' | 'groups'
const sectionNames: Record<Section, MessageKey> = { verification:'verification', moderation:'moderation', community:'community', keywords:'keywords' }

export async function getUi(userId:number):Promise<UiState> {
  const { data } = await db.from('verif_ui_state').select('user_id,chat_id,message_id,edit_key,language').eq('user_id',userId).maybeSingle()
  return (data as UiState | null) || { user_id:userId, chat_id:null, message_id:null, edit_key:null, language:'en' }
}
async function saveUi(userId:number, patch:Partial<UiState>) {
  const current = await getUi(userId)
  const row = { ...current, ...patch, updated_at:new Date().toISOString() }
  const { error } = await db.from('verif_ui_state').upsert(row,{ onConflict:'user_id' })
  if (error) throw error
  return row as UiState
}
export async function getGroup(chatId:number):Promise<GroupRow | null> {
  const { data,error } = await db.from('verif_groups').select('chat_id,title,language,settings').eq('chat_id',chatId).maybeSingle()
  if(error) throw error
  return data as GroupRow | null
}
export function groupSettings(group:GroupRow):BotSettings { return normalizeSettings(group.settings) }
export async function updateGroupSettings(chatId:number, settings:BotSettings) {
  const { error } = await db.from('verif_groups').update({settings,updated_at:new Date().toISOString()}).eq('chat_id',chatId)
  if(error) throw error
}
const backData = 'screen:home'
function fieldByKey(key:string):Field | undefined { return fields.find((field)=>field.key===key) }
function label(field:Field,lang:Language) { return tr(lang,field.label as MessageKey) }

export async function startPanel(userId:number, chatId:number, payload?:string) {
  const { data:groupAdmins } = await db.from('verif_group_admins').select('chat_id,username').eq('user_id',userId)
  let selected:number | null = null
  if(payload?.startsWith('cfg_')) {
    const candidate = Number(payload.slice(4))
    if(Number.isSafeInteger(candidate) && candidate < 0 && await isAdmin(candidate,userId)) selected=candidate
  }
  const ui=await getUi(userId)
  if(selected) {
    const group=await getGroup(selected)
    if(group) {
      await db.from('verif_group_admins').upsert({chat_id:selected,user_id:userId},{onConflict:'chat_id,user_id'})
      await saveUi(userId,{chat_id:selected,language:langOf(group.language),edit_key:null})
      return present(userId,'home',selected)
    }
  }
  const candidates:number[]=[]
  for(const row of groupAdmins || []) if(await isAdmin(row.chat_id,userId)) candidates.push(row.chat_id)
  if(candidates.length===1) {
    const group=await getGroup(candidates[0])
    await saveUi(userId,{chat_id:candidates[0],language:langOf(group?.language),edit_key:null})
    return present(userId,'home',candidates[0])
  }
  await saveUi(userId,{chat_id:null,edit_key:null})
  return present(userId,candidates.length ? 'groups':'language',null,candidates)
}
export async function isAdmin(chatId:number,userId:number) {
  const { isTelegramAdmin } = await import('./telegram')
  return isTelegramAdmin(chatId,userId)
}

function currentValue(settings:BotSettings,field:Field):unknown {
  return (settings.verification as Record<string,unknown>)[field.key] ?? (settings.moderation as Record<string,unknown>)[field.key]
}
function displayValue(value:unknown,lang:Language):string {
  if(typeof value==='boolean') return tr(lang,value?'on':'off')
  if(Array.isArray(value)) return value.join(', ') || '—'
  if(value===null || value===undefined || value==='') return '—'
  return String(value)
}
function header(group:GroupRow | null,lang:Language) { return group ? `${tr(lang,'settings')} · ${group.title}` : tr(lang,'groups') }
function sections(lang:Language):InlineButton[][] {
  return [
    [{text:tr(lang,'verification'),callback_data:'screen:verification'}],
    [{text:tr(lang,'moderation'),callback_data:'screen:moderation'}],
    [{text:tr(lang,'community'),callback_data:'screen:community'}],
    [{text:tr(lang,'keywords'),callback_data:'screen:keywords'}],
    [{text:tr(lang,'language'),callback_data:'screen:language'},{text:tr(lang,'groups'),callback_data:'screen:groups'}],
  ]
}
async function render(userId:number,screen:Screen,chatId:number|null,extras?:number[]):Promise<{text:string;keyboard:InlineKeyboard}> {
  const ui=await getUi(userId)
  const group=chatId ? await getGroup(chatId) : null
  const lang=group ? langOf(group.language) : langOf(ui.language)
  const keyboard:InlineButton[][]=[]
  if(screen==='language') {
    for(const choice of ['en','ru','zh','ar'] as Language[]) keyboard.push([{text:languageName(choice),callback_data:`lang:${choice}`}])
    keyboard.push([{text:tr(lang,'back'),callback_data:'screen:groups'}])
    return {text:tr(lang,'language'),keyboard:{inline_keyboard:keyboard}}
  }
  if(screen==='groups') {
    const {data:groups}=await db.from('verif_group_admins').select('chat_id').eq('user_id',userId)
    for(const row of groups||[]) {
      if(extras && !extras.includes(row.chat_id)) continue
      const candidate=await getGroup(row.chat_id)
      if(candidate && await isAdmin(row.chat_id,userId)) keyboard.push([{text:candidate.title.slice(0,60),callback_data:`group:${row.chat_id}`}])
    }
    if(!keyboard.length) keyboard.push([{text:tr(lang,'home'),callback_data:backData}])
    return {text:tr(lang,'chooseGroup'),keyboard:{inline_keyboard:keyboard}}
  }
  if(!group) return {text:tr(lang,'noGroups'),keyboard:{inline_keyboard:[[{text:tr(lang,'language'),callback_data:'screen:language'}]]}}
  const settings=groupSettings(group)
  if(screen==='home') {
    return {text:`${header(group,lang)}\n\n${tr(lang,'useSettings')}`,keyboard:{inline_keyboard:sections(lang)}}
  }
  if(screen==='field') return renderField(lang,group,settings,ui.edit_key,keyboard)
  const section=screen as Section
  for(const field of sectionFields(section)) {
    const val=displayValue(currentValue(settings,field),lang)
    keyboard.push([{text:`${label(field,lang)}: ${val}`.slice(0,60),callback_data:`field:${field.key}`}])
  }
  keyboard.push([{text:tr(lang,'back'),callback_data:backData}])
  return {text:`${tr(lang,sectionNames[section] as keyof typeof import('./i18n').messages.en)} · ${group.title}`,keyboard:{inline_keyboard:keyboard}}
}
function renderField(lang:Language,group:GroupRow,settings:BotSettings,key:string|null,keyboard:InlineButton[][]) {
  const field=key ? fieldByKey(key) : undefined
  if(!field) return {text:tr(lang,'settings'),keyboard:{inline_keyboard:[[ {text:tr(lang,'back'),callback_data:backData} ]]}}
  const value=currentValue(settings,field)
  const section=field.section
  if(field.kind==='toggle') keyboard.push([{text:`${label(field,lang)}: ${displayValue(value,lang)}`,callback_data:`toggle:${field.key}`}])
  else if(field.kind==='number') keyboard.push([{text:'−',callback_data:`step:${field.key}:-`},{text:String(value),callback_data:'noop'},{text:`+${field.step}`,callback_data:`step:${field.key}:+`}])
  else if(field.kind==='choice') for(const choice of field.choices||[]) keyboard.push([{text:`${String(value)===choice?'✓ ':''}${tr(lang,choice as MessageKey)}`,callback_data:`choice:${field.key}:${choice}`}])
  else keyboard.push([{text:tr(lang,'edit'),callback_data:`edit:${field.key}`}])
  keyboard.push([{text:tr(lang,'reset'),callback_data:`reset:${field.key}`}])
  keyboard.push([{text:tr(lang,'back'),callback_data:`screen:${section}`}])
  return {text:`${tr(lang,'settings')} · ${group.title}\n\n${label(field,lang)}\n${tr(lang,'current')}: ${displayValue(value,lang)}${field.kind==='number'?'':'\n'+tr(lang,'prompt')}`,keyboard:{inline_keyboard:keyboard}}
}

export async function present(userId:number,screen:Screen,chatId:number|null,extras?:number[],existingMessage?:{chatId:number;messageId:number}) {
  const ui=await getUi(userId)
  const view=await render(userId,screen,chatId,extras)
  const messageId=existingMessage?.messageId ?? ui.message_id
  let sentId:number
  if(messageId) {
    try {
      await editMessage(existingMessage?.chatId ?? userId,messageId,view.text,view.keyboard)
      sentId=messageId
    } catch {
      const sent=await sendMessage(userId,view.text,view.keyboard)
      sentId=sent.message_id
      await deleteMessage(userId,messageId)
    }
  } else {
    const sent=await sendMessage(userId,view.text,view.keyboard)
    sentId=sent.message_id
  }
  await saveUi(userId,{chat_id:chatId,message_id:sentId,edit_key:screen==='field' ? ui.edit_key : null})
}
export async function handlePanelCallback(userId:number,callbackId:string,messageId:number,data:string) {
  const ui=await getUi(userId)
  const group=ui.chat_id ? await getGroup(ui.chat_id) : null
  if(group && !(await isAdmin(group.chat_id,userId))) {
    await tg('answerCallbackQuery',{callback_query_id:callbackId,text:tr(langOf(group.language),'adminOnly'),show_alert:true})
    return
  }
  await tg('answerCallbackQuery',{callback_query_id:callbackId})
  const currentChat=group?.chat_id ?? null
  const lang=group ? langOf(group.language) : langOf(ui.language)
  const [action,a,b]=data.split(':')
  if(action==='noop') return
  if(action==='lang' && (a==='en'||a==='ru'||a==='zh'||a==='ar')) {
    if(currentChat) await db.from('verif_groups').update({language:a,updated_at:new Date().toISOString()}).eq('chat_id',currentChat)
    await saveUi(userId,{language:a,edit_key:null})
    return present(userId,currentChat?'home':'groups',currentChat,undefined,{chatId:userId,messageId})
  }
  if(action==='screen') {
    if(a==='language') return present(userId,'language',currentChat,undefined,{chatId:userId,messageId})
    if(a==='groups') return present(userId,'groups',null,undefined,{chatId:userId,messageId})
    if(a==='home') return present(userId,'home',currentChat,undefined,{chatId:userId,messageId})
    if(['verification','moderation','community','keywords'].includes(a)) return present(userId,a as Section,currentChat,undefined,{chatId:userId,messageId})
  }
  if(action==='group') {
    const nextGroup=Number(a)
    if(Number.isSafeInteger(nextGroup) && await isAdmin(nextGroup,userId)) {
      await saveUi(userId,{chat_id:nextGroup,edit_key:null})
      return present(userId,'home',nextGroup,undefined,{chatId:userId,messageId})
    }
  }
  if(action==='field' && currentChat) {
    const field=fieldByKey(a)
    if(field) { await saveUi(userId,{edit_key:field.key}); return present(userId,'field',currentChat,undefined,{chatId:userId,messageId}) }
  }
  if(!currentChat || !group) return present(userId,'groups',null,undefined,{chatId:userId,messageId})
  const settings=groupSettings(group)
  const field=fieldByKey(a)
  if(action==='toggle' && field && field.kind==='toggle') {
    const value=currentValue(settings,field)
    await updateGroupSettings(currentChat,updateSetting(settings,field.key,!value))
    await db.from('verif_ui_state').update({edit_key:field.key}).eq('user_id',userId)
    return present(userId,'field',currentChat,undefined,{chatId:userId,messageId})
  }
  if(action==='step' && field && field.kind==='number') {
    const old=Number(currentValue(settings,field)); const step=field.step||1; const next=old+(b==='+'?step:-step)
    await updateGroupSettings(currentChat,updateSetting(settings,field.key,Math.min(field.max||10000,Math.max(field.min||0,next))))
    await db.from('verif_ui_state').update({edit_key:field.key}).eq('user_id',userId)
    return present(userId,'field',currentChat,undefined,{chatId:userId,messageId})
  }
  if(action==='choice' && field && field.kind==='choice' && field.choices?.includes(b)) {
    await updateGroupSettings(currentChat,updateSetting(settings,field.key,b))
    await db.from('verif_ui_state').update({edit_key:field.key}).eq('user_id',userId)
    return present(userId,'field',currentChat,undefined,{chatId:userId,messageId})
  }
  if(action==='edit' && field) {
    await saveUi(userId,{edit_key:field.key})
    const prompt=field.key==='welcome_text'?'editWelcome':field.key==='rules'?'editRules':field.key==='join_chat_id'?'joinChat':'editKeywords'
    const currentFieldView=await render(userId,'field',currentChat)
    return editMessage(userId,messageId,`${currentFieldView.text}\n\n${tr(lang,prompt as keyof typeof import('./i18n').messages.en)}`,{inline_keyboard:[[{text:tr(lang,'back'),callback_data:`field:${field.key}`}]]})
  }
  if(action==='reset' && field) {
    await updateGroupSettings(currentChat,updateSetting(settings,field.key,(defaults.verification as Record<string,unknown>)[field.key]??(defaults.moderation as Record<string,unknown>)[field.key]))
    await db.from('verif_ui_state').update({edit_key:field.key}).eq('user_id',userId)
    return present(userId,'field',currentChat,undefined,{chatId:userId,messageId})
  }
}

export async function handlePrivateText(userId:number,messageId:number,text:string) {
  const ui=await getUi(userId)
  await deleteMessage(userId,messageId)
  if(!ui.edit_key || !ui.chat_id) return
  if(!(await isAdmin(ui.chat_id,userId))) { await saveUi(userId,{edit_key:null}); return }
  const group=await getGroup(ui.chat_id)
  if(!group) return
  const field=fieldByKey(ui.edit_key)
  if(!field || !['text','longtext','keywords'].includes(field.kind)) { await saveUi(userId,{edit_key:null}); return }
  const settings=groupSettings(group)
  let value:unknown=text.trim().slice(0,field.key==='rules'?3000:800)
  if(field.key==='keywords') value=String(value).split(/[\n,]/).map((item)=>item.trim()).filter(Boolean).slice(0,100)
  if(field.key==='join_chat_id' && value && !/^(@[A-Za-z0-9_]{5,}|-?\d{5,})$/.test(String(value))) {
    await present(userId,'field',ui.chat_id)
    await tg('sendMessage',{chat_id:userId,text:tr(langOf(group.language),'invalid')})
    return
  }
  await updateGroupSettings(ui.chat_id,updateSetting(settings,field.key,value))
  await saveUi(userId,{edit_key:field.key})
  await present(userId,'field',ui.chat_id)
}
