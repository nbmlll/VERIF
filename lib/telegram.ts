export type TelegramUser = { id: number; is_bot?: boolean; first_name: string; last_name?: string; username?: string; language_code?: string }
export type TelegramChat = { id: number; type: 'private' | 'group' | 'supergroup' | 'channel'; title?: string }
export type InlineButton = { text: string; callback_data?: string; url?: string }
export type InlineKeyboard = { inline_keyboard: InlineButton[][] }
export type TelegramMessage = {
  message_id: number; chat: TelegramChat; from?: TelegramUser; text?: string; new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser; reply_to_message?: TelegramMessage; invite_link?: { creator: TelegramUser };
}
export type TelegramCallback = { id: string; from: TelegramUser; data?: string; message?: TelegramMessage }
export type TelegramUpdate = {
  update_id: number; message?: TelegramMessage; callback_query?: TelegramCallback;
  my_chat_member?: { chat: TelegramChat; from: TelegramUser; new_chat_member: { status: string } };
  chat_member?: { chat: TelegramChat; from: TelegramUser; old_chat_member: { status: string }; new_chat_member: { status: string; user: TelegramUser }; invite_link?: { creator: TelegramUser } };
}

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
const base = `https://api.telegram.org/bot${token}`

export async function tg<T = unknown>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${base}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    cache: 'no-store', signal: AbortSignal.timeout(12_000),
  })
  const result = await response.json() as { ok: boolean; result?: T; description?: string }
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} failed (${response.status})`)
  return result.result as T
}

export async function sendMessage(chatId: number, text: string, markup?: InlineKeyboard, extra: Record<string, unknown> = {}) {
  return tg<TelegramMessage>('sendMessage', { chat_id: chatId, text, ...(markup ? { reply_markup: markup } : {}), ...extra })
}
export async function editMessage(chatId: number, messageId: number, text: string, markup?: InlineKeyboard) {
  try {
    return await tg<TelegramMessage>('editMessageText', { chat_id: chatId, message_id: messageId, text, ...(markup ? { reply_markup: markup } : {}) })
  } catch (error) {
    if (error instanceof Error && /message is not modified/i.test(error.message)) return null
    throw error
  }
}
export async function deleteMessage(chatId: number, messageId: number) {
  try { await tg('deleteMessage', { chat_id: chatId, message_id: messageId }) } catch { /* Telegram may already have removed it. */ }
}
export async function isTelegramAdmin(chatId: number, userId: number) {
  try {
    const member = await tg<{ status: string }>('getChatMember', { chat_id: chatId, user_id: userId })
    return member.status === 'administrator' || member.status === 'creator'
  } catch { return false }
}
export async function botUsername() {
  const me = await tg<{ username: string }>('getMe')
  return me.username
}
export function userLabel(user: TelegramUser) { return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || String(user.id) }
