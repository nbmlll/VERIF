import { db } from './db'
import { createCapabilityActionService, type CapabilityActionDependencies } from './capability-actions'
import { tg } from './telegram'

type GroupAccess = Pick<CapabilityActionDependencies, 'getGroup' | 'updateGroupSettings'>

export function createLiveCapabilityActionService(groupAccess: GroupAccess) {
  const dependencies: CapabilityActionDependencies = {
    ...groupAccess,
    getChatMember: (chatId, userId) => tg('getChatMember', { chat_id: chatId, user_id: userId }),
    getBotId: async () => (await tg<{ id: number }>('getMe')).id,
    updateGroupLanguage: async (chatId, language) => {
      const { error } = await db.from('verif_groups').update({ language, updated_at: new Date().toISOString() }).eq('chat_id', chatId)
      if (error) throw error
    },
    reserveAudit: async (record) => {
      const { data, error } = await db.from('verif_action_audit').insert(record).select('id').single()
      if (error) return { ok: false, code: error.code }
      return data?.id ? { ok: true, id: String(data.id) } : { ok: false }
    },
    finalizeAudit: async (auditId, chatId, outcome, details) => {
      const { data, error } = await db.from('verif_action_audit')
        .update({ outcome, details })
        .eq('id', auditId)
        .eq('chat_id', chatId)
        .select('id')
        .maybeSingle()
      return !error && Boolean(data)
    },
    incrementWarning: async (chatId, targetUserId) => {
      const { data, error } = await db.rpc('increment_verif_member_warning', {
        p_chat_id: chatId,
        p_telegram_user_id: targetUserId,
      })
      if (error) throw error
      const count = Number(data)
      if (!Number.isInteger(count) || count < 1) throw new Error('Warning increment was not confirmed')
      return count
    },
    getWarningCount: async (chatId, targetUserId) => {
      const { data, error } = await db.from('verif_members')
        .select('warnings')
        .eq('chat_id', chatId)
        .eq('telegram_user_id', targetUserId)
        .maybeSingle()
      if (error) throw error
      return data ? Number(data.warnings) : null
    },
    applyModeration: async ({ action, chatId, targetUserId }) => {
      if (action === 'mute') {
        await tg('restrictChatMember', {
          chat_id: chatId,
          user_id: targetUserId,
          permissions: {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
          },
          until_date: Math.floor(Date.now() / 1000) + 600,
          use_independent_chat_permissions: true,
        })
      } else if (action === 'ban') {
        await tg('banChatMember', { chat_id: chatId, user_id: targetUserId, revoke_messages: false })
      } else if (action === 'kick') {
        await tg('banChatMember', {
          chat_id: chatId,
          user_id: targetUserId,
          until_date: Math.floor(Date.now() / 1000) + 30,
          revoke_messages: false,
        })
        await tg('unbanChatMember', { chat_id: chatId, user_id: targetUserId, only_if_banned: true })
      } else {
        await tg('unbanChatMember', { chat_id: chatId, user_id: targetUserId, only_if_banned: true })
      }
    },
  }

  return createCapabilityActionService(dependencies)
}

