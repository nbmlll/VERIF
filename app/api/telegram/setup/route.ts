import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { tg } from '@/lib/telegram'

export const runtime='nodejs'
export const dynamic='force-dynamic'

function authorized(request:NextRequest) {
  const secret=process.env.CRON_SECRET
  const authorization=request.headers.get('authorization')||''
  if(!secret||!authorization.startsWith('Bearer ')) return false
  const provided=Buffer.from(authorization.slice(7))
  const expected=Buffer.from(secret)
  return provided.length===expected.length&&timingSafeEqual(provided,expected)
}

export async function POST(request:NextRequest) {
  const origin=request.headers.get('origin')
  if(origin&&origin!==request.nextUrl.origin) return NextResponse.json({ok:false},{status:403})
  if(!authorized(request)) return NextResponse.json({ok:false},{status:401})
  const baseUrl=process.env.APP_URL?.replace(/\/$/,'')||(process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:request.nextUrl.origin)
  const webhookUrl=`${baseUrl}/api/telegram/webhook`
  try {
    const current=await tg<{url:string}>('getWebhookInfo')
    if(current.url===webhookUrl) return NextResponse.json({ok:true,alreadySet:true,webhookUrl})
    const secretToken=createHash('sha256').update(`${process.env.TELEGRAM_BOT_TOKEN}:verif-webhook`).digest('hex')
    await tg('setWebhook',{url:webhookUrl,secret_token:secretToken,allowed_updates:['message','callback_query','my_chat_member','chat_member'],drop_pending_updates:false})
    return NextResponse.json({ok:true,alreadySet:false,webhookUrl})
  } catch(error) {
    console.error('[verif] manual webhook setup failed',error instanceof Error?error.message:'unknown error')
    return NextResponse.json({ok:false},{status:502})
  }
}
