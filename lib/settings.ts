import type { Language } from './i18n'

export type BotSettings = {
  verification: { enabled: boolean; mode: 'math' | 'invite' | 'web' | 'join'; timeout_seconds: number; required_invites: number; web_enabled: boolean; join_chat_id: string }
  moderation: { max_message_length: number; flood_limit: number; flood_window_seconds: number; duplicate_limit: number; welcome_enabled: boolean; welcome_text: string; rules: string; keywords: string[]; keyword_action: 'delete' | 'warn' | 'mute'; keyword_mode: 'off' | 'exact' | 'ai'; auto_delete_seconds: number }
}
export const defaults: BotSettings = {
  verification: { enabled: true, mode: 'math', timeout_seconds: 300, required_invites: 1, web_enabled: false, join_chat_id: '' },
  moderation: { max_message_length: 1000, flood_limit: 6, flood_window_seconds: 10, duplicate_limit: 3, welcome_enabled: false, welcome_text: 'Welcome, {name}!', rules: '', keywords: [], keyword_action: 'delete', keyword_mode: 'off', auto_delete_seconds: 0 },
}
export type Section = 'verification' | 'moderation' | 'community' | 'keywords'
export type Field = { key: keyof BotSettings['verification'] | keyof BotSettings['moderation']; section: Section; kind: 'toggle' | 'number' | 'choice' | 'text' | 'longtext' | 'keywords'; min?: number; max?: number; step?: number; choices?: string[]; label: string }
export const fields: Field[] = [
  { key:'enabled', section:'verification', kind:'toggle', label:'verification' },
  { key:'mode', section:'verification', kind:'choice', choices:['math','invite','web','join'], label:'mode' },
  { key:'timeout_seconds', section:'verification', kind:'number', min:60, max:3600, step:60, label:'timeout' },
  { key:'required_invites', section:'verification', kind:'number', min:1, max:100, step:1, label:'inviteCount' },
  { key:'web_enabled', section:'verification', kind:'toggle', label:'webVerification' },
  { key:'join_chat_id', section:'verification', kind:'text', label:'joinChat' },
  { key:'max_message_length', section:'moderation', kind:'number', min:100, max:10000, step:10, label:'messageLength' },
  { key:'flood_limit', section:'moderation', kind:'number', min:2, max:100, step:1, label:'flood' },
  { key:'flood_window_seconds', section:'moderation', kind:'number', min:2, max:120, step:1, label:'floodWindow' },
  { key:'duplicate_limit', section:'moderation', kind:'number', min:2, max:20, step:1, label:'duplicates' },
  { key:'welcome_enabled', section:'community', kind:'toggle', label:'welcomeEnabled' },
  { key:'welcome_text', section:'community', kind:'longtext', label:'welcomeText' },
  { key:'rules', section:'community', kind:'longtext', label:'rules' },
  { key:'keywords', section:'keywords', kind:'keywords', label:'keywordList' },
  { key:'keyword_mode', section:'keywords', kind:'choice', choices:['off','exact','ai'], label:'keywordMode' },
  { key:'keyword_action', section:'keywords', kind:'choice', choices:['delete','warn','mute'], label:'keywordAction' },
  { key:'auto_delete_seconds', section:'moderation', kind:'number', min:0, max:3600, step:10, label:'autoDelete' },
]
export const sectionFields = (section: Section) => fields.filter((field) => field.section === section)
export function normalizeSettings(input: unknown): BotSettings {
  const settings = structuredClone(defaults)
  if (!input || typeof input !== 'object') return settings
  const obj = input as Partial<BotSettings>
  for (const section of ['verification','moderation'] as const) {
    if (!obj[section] || typeof obj[section] !== 'object') continue
    Object.assign(settings[section], obj[section])
  }
  settings.moderation.max_message_length = clampInteger(settings.moderation.max_message_length, 100, 10000, 1000)
  settings.moderation.flood_limit = clampInteger(settings.moderation.flood_limit, 2, 100, 6)
  settings.moderation.flood_window_seconds = clampInteger(settings.moderation.flood_window_seconds, 2, 120, 10)
  settings.moderation.duplicate_limit = clampInteger(settings.moderation.duplicate_limit, 2, 20, 3)
  settings.verification.timeout_seconds = clampInteger(settings.verification.timeout_seconds, 60, 3600, 300)
  settings.verification.required_invites = clampInteger(settings.verification.required_invites, 1, 100, 1)
  settings.moderation.auto_delete_seconds = clampInteger(settings.moderation.auto_delete_seconds, 0, 3600, 0)
  if (!['math','invite','web','join'].includes(settings.verification.mode)) settings.verification.mode = 'math'
  if (!['delete','warn','mute'].includes(settings.moderation.keyword_action)) settings.moderation.keyword_action = 'delete'
  if (!['off','exact','ai'].includes(settings.moderation.keyword_mode)) settings.moderation.keyword_mode = 'off'
  settings.moderation.keywords = Array.isArray(settings.moderation.keywords) ? settings.moderation.keywords.filter((word): word is string => typeof word === 'string').slice(0,100) : []
  settings.moderation.welcome_text = safeText(settings.moderation.welcome_text, defaults.moderation.welcome_text, 800)
  settings.moderation.rules = safeText(settings.moderation.rules, '', 3000)
  settings.verification.join_chat_id = safeText(settings.verification.join_chat_id, '', 100)
  settings.moderation.welcome_enabled = Boolean(settings.moderation.welcome_enabled)
  settings.verification.enabled = Boolean(settings.verification.enabled)
  settings.verification.web_enabled = Boolean(settings.verification.web_enabled)
  return settings
}
export function clampInteger(value: unknown, min: number, max: number, fallback: number) { const n = Number(value); return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback }
export function safeText(value: unknown, fallback: string, max: number) { return typeof value === 'string' ? value.trim().slice(0,max) : fallback }
export function updateSetting(settings: BotSettings, key: Field['key'], value: unknown): BotSettings {
  const next = normalizeSettings(settings)
  if (key === 'keywords') next.moderation.keywords = (Array.isArray(value) ? value : String(value).split(',')).map((v) => String(v).trim()).filter(Boolean).slice(0,100)
  else if (key in next.verification) (next.verification as Record<string,unknown>)[key] = value
  else (next.moderation as Record<string,unknown>)[key] = value
  return normalizeSettings(next)
}
export function languageForGroup(value: unknown): Language { return value === 'ru' || value === 'zh' || value === 'ar' ? value : 'en' }
