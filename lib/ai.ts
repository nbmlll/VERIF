import { generateText, Output } from 'ai'
import { z } from 'zod'

const model = 'google/gemini-2.5-flash'
const commandSchema = z.object({
  action: z.enum(['set_message_length','set_flood_limit','set_flood_window','set_duplicate_limit','set_welcome_enabled','set_welcome','set_rules','set_keyword','set_keyword_mode','set_keyword_action','set_auto_delete','set_verification_enabled','set_verification_trigger','set_verification_mode','set_verification_timeout','set_required_invites','set_web_enabled','set_join_chat','warn','mute','ban','kick','unban','show_rules','unknown']),
  value: z.union([z.string().max(1200),z.number().int(),z.boolean()]).nullable(),
  target_user_id: z.number().int().positive().nullable(),
  reason: z.string().max(300).nullable(),
})
export type AdminIntent = z.infer<typeof commandSchema>
export async function interpretAdminCommand(text: string): Promise<AdminIntent> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: commandSchema }),
    system: 'Extract one admin intent from this Telegram group message. Return only the schema. Never invent user ids, group ids, values, or targets. Moderation targets come only from the replied-to message; never use a guessed target_user_id. Return booleans as JSON booleans and numeric settings as integers. Extract setting values only when the administrator explicitly requests them. If uncertain, use action unknown. This app does not grant arbitrary tools and the server validates every action.',
    prompt: text.slice(0, 1500),
    maxOutputTokens: 160,
  })
  return commandSchema.parse(output)
}
const keywordSchema = z.object({ matched: z.boolean(), keyword: z.string().max(100).nullable() })
export async function matchConfiguredKeyword(text: string, allowedKeywords: string[]) {
  if (!allowedKeywords.length || !text.trim()) return null
  const { output } = await generateText({
    model,
    output: Output.object({ schema: keywordSchema }),
    system: `Check whether the message matches one of the configured terms or a clear evasion/variant of one. Return the exact configured term, never a new term. Allowed terms: ${JSON.stringify(allowedKeywords.slice(0,100))}.`,
    prompt: text.slice(0, 2500),
    maxOutputTokens: 60,
  })
  const parsed = keywordSchema.parse(output)
  return parsed.matched && parsed.keyword && allowedKeywords.includes(parsed.keyword) ? parsed.keyword : null
}
