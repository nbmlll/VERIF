import { db } from './db'

type VerificationStatus='required'|'pending'|'verified'

function record(value:unknown):Record<string,unknown> {
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
}

export async function setMemberVerificationStatus(chatId:number,userId:number,status:VerificationStatus) {
  const {data,error}=await db.from('verif_members').select('restrictions').eq('chat_id',chatId).eq('telegram_user_id',userId).maybeSingle()
  if(error) throw error
  const restrictions=record(data?.restrictions)
  const nextRestrictions={...restrictions,verification:{status,updated_at:new Date().toISOString()}}
  const {error:upsertError}=await db.from('verif_members').upsert({chat_id:chatId,telegram_user_id:userId,restrictions:nextRestrictions},{onConflict:'chat_id,telegram_user_id'})
  if(upsertError) throw upsertError
}

export async function getMemberVerificationStatus(chatId:number,userId:number):Promise<VerificationStatus|null> {
  const {data,error}=await db.from('verif_members').select('restrictions').eq('chat_id',chatId).eq('telegram_user_id',userId).maybeSingle()
  if(error) throw error
  const status=record(record(data?.restrictions).verification).status
  return status==='required'||status==='pending'||status==='verified'?status:null
}
