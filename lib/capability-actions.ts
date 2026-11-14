import { createHash } from 'node:crypto'
import { z } from 'zod'
import { getCapability } from './capabilities'
import { normalizeSettings, updateSetting, type BotSettings, type Field } from './settings'

type TelegramMember = {
  status: string
  can_restrict_members?: boolean
  permissions?: { can_send_messages?: boolean }
}

type AuditRecord = {
  chat_id: number
  actor_id: number
  action: string
  details: Record<string, unknown>
  outcome: string
}

type AuditReservation =
  | { ok: true; id: string }
  | { ok: false; code?: string }

export type CapabilityActionDependencies = {
  getGroup(chatId: number): Promise<{ settings: unknown; language?: string | null } | null>
  getChatMember(chatId: number, userId: number): Promise<TelegramMember>
  getBotId(): Promise<number>
  updateGroupSettings(chatId: number, settings: BotSettings): Promise<void>
  updateGroupLanguage(chatId: number, language: string): Promise<void>
  reserveAudit(record: AuditRecord): Promise<AuditReservation>
  finalizeAudit(auditId: string, chatId: number, outcome: string, details: Record<string, unknown>): Promise<boolean>
  incrementWarning(chatId: number, targetUserId: number): Promise<number>
  getWarningCount(chatId: number, targetUserId: number): Promise<number | null>
  applyModeration(input: { action: 'mute' | 'ban' | 'kick' | 'unban'; chatId: number; targetUserId: number }): Promise<void>
}

export type CapabilityActionStatus =
  | 'success'
  | 'invalid_input'
  | 'feature_unavailable'
  | 'unsupported'
  | 'group_not_found'
  | 'admin_required'
  | 'bot_not_in_group'
  | 'bot_permission_missing'
  | 'target_is_admin'
  | 'target_not_member'
  | 'target_already_banned'
  | 'target_not_banned'
  | 'cannot_target_self'
  | 'already_processed'
  | 'audit_unavailable'
  | 'action_failed'
  | 'state_unverified'
  | 'audit_finalize_failed'
  | 'service_error'

export type CapabilityActionResult =
  | { status: 'success'; auditId: string; warningCount?: number }
  | { status: Exclude<CapabilityActionStatus, 'success'> }

const chatIdSchema = z.number().int().safe().negative()
const userIdSchema = z.number().int().safe().positive()
const eventTokenSchema = z.string().regex(/^[a-zA-Z0-9:_-]{1,120}$/)
const boundedInteger = (min: number, max: number) => z.union([
  z.number().int(),
  z.string().trim().regex(/^\d+$/).transform(Number),
]).pipe(z.number().int().min(min).max(max))

const settingsActionSchema = z.discriminatedUnion('action', [
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_message_length'), value: boundedInteger(100, 10000) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_flood_limit'), value: boundedInteger(2, 100) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_flood_window'), value: boundedInteger(2, 120) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_duplicate_limit'), value: boundedInteger(2, 20) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_welcome_enabled'), value: z.boolean() }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_welcome'), value: z.string().trim().max(800) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_rules'), value: z.string().trim().max(3000) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_keyword'), value: z.union([z.string().max(2000), z.array(z.string().max(100)).max(100)]) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_keyword_mode'), value: z.enum(['off', 'exact', 'ai']) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_keyword_action'), value: z.enum(['delete', 'warn', 'mute']) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_auto_delete'), value: boundedInteger(0, 3600) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_verification_enabled'), value: z.boolean() }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_verification_trigger'), value: z.enum(['join', 'first_message']) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_verification_mode'), value: z.enum(['math', 'invite', 'web', 'join']) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_verification_timeout'), value: boundedInteger(60, 3600) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_required_invites'), value: boundedInteger(1, 100) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_web_enabled'), value: z.boolean() }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, eventToken: eventTokenSchema, action: z.literal('set_join_chat'), value: z.string().trim().max(100).refine((value) => !value || /^(@[A-Za-z0-9_]{5,}|-?\\d{5,})$/.test(value)) }).strict(),
])

const languageActionSchema = z.object({
  chatId: chatIdSchema,
  actorId: userIdSchema,
  eventToken: eventTokenSchema,
  language: z.enum(['en', 'ru', 'zh', 'ar']),
}).strict()

const memberActionSchema = z.discriminatedUnion('action', [
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, targetUserId: userIdSchema, action: z.literal('warn'), eventToken: eventTokenSchema, reason: z.string().trim().min(1).max(250) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, targetUserId: userIdSchema, action: z.literal('unban'), eventToken: eventTokenSchema, reason: z.string().trim().min(1).max(250) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, targetUserId: userIdSchema, action: z.literal('mute'), confirmationToken: z.string().uuid(), reason: z.string().trim().min(1).max(250) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, targetUserId: userIdSchema, action: z.literal('ban'), confirmationToken: z.string().uuid(), reason: z.string().trim().min(1).max(250) }).strict(),
  z.object({ chatId: chatIdSchema, actorId: userIdSchema, targetUserId: userIdSchema, action: z.literal('kick'), confirmationToken: z.string().uuid(), reason: z.string().trim().min(1).max(250) }).strict(),
])

const settingDefinition = {
  set_message_length: { capabilityId: 'character_word_spam_detection', key: 'max_message_length' },
  set_flood_limit: { capabilityId: 'anti_flood', key: 'flood_limit' },
  set_flood_window: { capabilityId: 'anti_flood', key: 'flood_window_seconds' },
  set_duplicate_limit: { capabilityId: 'duplicate_content_detection', key: 'duplicate_limit' },
  set_welcome_enabled: { capabilityId: 'group_scoped_settings', key: 'welcome_enabled' },
  set_welcome: { capabilityId: 'group_scoped_settings', key: 'welcome_text' },
  set_rules: { capabilityId: 'moderation_warning_rule_settings', key: 'rules' },
  set_keyword: { capabilityId: 'anti_spam', key: 'keywords' },
  set_keyword_mode: { capabilityId: 'anti_spam', key: 'keyword_mode' },
  set_keyword_action: { capabilityId: 'anti_spam', key: 'keyword_action' },
  set_auto_delete: { capabilityId: 'delete_message', key: 'auto_delete_seconds' },
  set_verification_enabled: { capabilityId: 'verification_settings', key: 'enabled' },
  set_verification_trigger: { capabilityId: 'verification_settings', key: 'trigger' },
  set_verification_mode: { capabilityId: 'verification_settings', key: 'mode' },
  set_verification_timeout: { capabilityId: 'verification_settings', key: 'timeout_seconds' },
  set_required_invites: { capabilityId: 'verification_settings', key: 'required_invites' },
  set_web_enabled: { capabilityId: 'verification_settings', key: 'web_enabled' },
  set_join_chat: { capabilityId: 'verification_settings', key: 'join_chat_id' },
} as const satisfies Record<z.infer<typeof settingsActionSchema>['action'], { capabilityId: string; key: Field['key'] }>

const memberCapability: Record<z.infer<typeof memberActionSchema>['action'], string> = {
  warn: 'warning_strike_system',
  unban: 'unban_user',
  mute: 'temporary_restriction',
  ban: 'ban_user',
  kick: 'kick_user',
}

function capabilityAvailability(capabilityId: string): 'unsupported' | 'feature_unavailable' | null {
  const capability = getCapability(capabilityId)
  if (!capability || capability.implementationStatus === 'planned') return 'feature_unavailable'
  if (capability.implementationStatus === 'unsupported') return 'unsupported'
  return null
}

function isAdminStatus(status: string) {
  return status === 'administrator' || status === 'creator'
}

function isActiveMember(status: string) {
  return status === 'member' || status === 'restricted'
}

function readSetting(settings: BotSettings, key: Field['key']): unknown {
  if (key in settings.verification) return (settings.verification as unknown as Record<string, unknown>)[key]
  return (settings.moderation as unknown as Record<string, unknown>)[key]
}

function valueDigest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function createCapabilityActionService(dependencies: CapabilityActionDependencies) {
  async function finishAudit(auditId: string, chatId: number, outcome: string, details: Record<string, unknown>) {
    try {
      return await dependencies.finalizeAudit(auditId, chatId, outcome, details)
    } catch {
      return false
    }
  }

  async function executeSetting(rawInput: unknown): Promise<CapabilityActionResult> {
    const parsed = settingsActionSchema.safeParse(rawInput)
    if (!parsed.success) return { status: 'invalid_input' }
    const input = parsed.data
    const definition = settingDefinition[input.action]
    const unavailable = capabilityAvailability(definition.capabilityId)
    if (unavailable) return { status: unavailable }

    try {
      const group = await dependencies.getGroup(input.chatId)
      if (!group) return { status: 'group_not_found' }
      const actor = await dependencies.getChatMember(input.chatId, input.actorId)
      if (!isAdminStatus(actor.status)) return { status: 'admin_required' }

      let value: unknown = input.value
      if (input.action === 'set_keyword') {
        const rawKeywords = Array.isArray(input.value) ? input.value : input.value.split(/[\\n,]/)
        const keywords = rawKeywords.map((word) => word.trim()).filter(Boolean)
        if (keywords.length > 100 || keywords.some((word) => word.length > 100)) return { status: 'invalid_input' }
        value = keywords
      }

      const settings = normalizeSettings(group.settings)
      const nextSettings = updateSetting(settings, definition.key, value)
      const details = {
        event_token: input.eventToken,
        capability_id: definition.capabilityId,
        setting_key: definition.key,
        value_sha256: valueDigest(value),
      }

      let reservation: AuditReservation
      try {
        reservation = await dependencies.reserveAudit({
          chat_id: input.chatId,
          actor_id: input.actorId,
          action: `settings.${definition.key}`,
          details,
          outcome: 'pending',
        })
      } catch {
        return { status: 'audit_unavailable' }
      }
      if (!reservation.ok) return { status: reservation.code === '23505' ? 'already_processed' : 'audit_unavailable' }

      try {
        await dependencies.updateGroupSettings(input.chatId, nextSettings)
      } catch {
        const finalized = await finishAudit(reservation.id, input.chatId, 'execution_error', { ...details, error_code: 'settings_update_failed' })
        return { status: finalized ? 'action_failed' : 'audit_finalize_failed' }
      }

      let after: { settings: unknown } | null
      try {
        after = await dependencies.getGroup(input.chatId)
      } catch {
        after = null
      }
      const verified = after !== null && JSON.stringify(readSetting(normalizeSettings(after.settings), definition.key)) === JSON.stringify(readSetting(nextSettings, definition.key))
      if (!verified) {
        const finalized = await finishAudit(reservation.id, input.chatId, 'unverified', { ...details, verified: false })
        return { status: finalized ? 'state_unverified' : 'audit_finalize_failed' }
      }

      const finalized = await finishAudit(reservation.id, input.chatId, 'success', { ...details, verified: true })
      if (!finalized) return { status: 'audit_finalize_failed' }
      return { status: 'success', auditId: reservation.id }
    } catch {
      return { status: 'service_error' }
    }
  }

  async function executeLanguageAction(rawInput: unknown): Promise<CapabilityActionResult> {
    const parsed = languageActionSchema.safeParse(rawInput)
    if (!parsed.success) return { status: 'invalid_input' }
    const input = parsed.data
    const unavailable = capabilityAvailability('notification_language_settings')
    if (unavailable) return { status: unavailable }

    try {
      const group = await dependencies.getGroup(input.chatId)
      if (!group) return { status: 'group_not_found' }
      const actor = await dependencies.getChatMember(input.chatId, input.actorId)
      if (!isAdminStatus(actor.status)) return { status: 'admin_required' }
      const details = {
        event_token: input.eventToken,
        capability_id: 'notification_language_settings',
        language: input.language,
        value_sha256: valueDigest(input.language),
      }
      let reservation: AuditReservation
      try {
        reservation = await dependencies.reserveAudit({
          chat_id: input.chatId,
          actor_id: input.actorId,
          action: 'settings.language',
          details,
          outcome: 'pending',
        })
      } catch {
        return { status: 'audit_unavailable' }
      }
      if (!reservation.ok) return { status: reservation.code === '23505' ? 'already_processed' : 'audit_unavailable' }

      try {
        await dependencies.updateGroupLanguage(input.chatId, input.language)
      } catch {
        const finalized = await finishAudit(reservation.id, input.chatId, 'execution_error', { ...details, error_code: 'language_update_failed' })
        return { status: finalized ? 'action_failed' : 'audit_finalize_failed' }
      }

      let after: { settings: unknown; language?: string | null } | null
      try {
        after = await dependencies.getGroup(input.chatId)
      } catch {
        after = null
      }
      if (after?.language !== input.language) {
        const finalized = await finishAudit(reservation.id, input.chatId, 'unverified', { ...details, verified: false })
        return { status: finalized ? 'state_unverified' : 'audit_finalize_failed' }
      }

      const finalized = await finishAudit(reservation.id, input.chatId, 'success', { ...details, verified: true })
      if (!finalized) return { status: 'audit_finalize_failed' }
      return { status: 'success', auditId: reservation.id }
    } catch {
      return { status: 'service_error' }
    }
  }

  async function executeMemberAction(rawInput: unknown): Promise<CapabilityActionResult> {
    const parsed = memberActionSchema.safeParse(rawInput)
    if (!parsed.success) return { status: 'invalid_input' }
    const input = parsed.data
    const capabilityId = memberCapability[input.action]
    const unavailable = capabilityAvailability(capabilityId)
    if (unavailable) return { status: unavailable }
    if (input.actorId === input.targetUserId) return { status: 'cannot_target_self' }

    try {
      const group = await dependencies.getGroup(input.chatId)
      if (!group) return { status: 'group_not_found' }
      const actor = await dependencies.getChatMember(input.chatId, input.actorId)
      if (!isAdminStatus(actor.status)) return { status: 'admin_required' }

      const botId = await dependencies.getBotId()
      const bot = await dependencies.getChatMember(input.chatId, botId)
      if (!['member', 'restricted', 'administrator', 'creator'].includes(bot.status)) return { status: 'bot_not_in_group' }
      if (input.action !== 'warn' && (bot.status !== 'creator' && (bot.status !== 'administrator' || bot.can_restrict_members !== true))) {
        return { status: 'bot_permission_missing' }
      }

      const target = await dependencies.getChatMember(input.chatId, input.targetUserId)
      if (isAdminStatus(target.status)) return { status: 'target_is_admin' }
      if (input.action === 'unban' && target.status !== 'kicked') return { status: 'target_not_banned' }
      if ((input.action === 'warn' || input.action === 'mute' || input.action === 'kick') && !isActiveMember(target.status)) {
        return { status: 'target_not_member' }
      }
      if (input.action === 'ban' && target.status === 'kicked') return { status: 'target_already_banned' }

      const tokenDetails = 'confirmationToken' in input
        ? { confirmation_token: input.confirmationToken }
        : { event_token: input.eventToken }
      const details = {
        ...tokenDetails,
        capability_id: capabilityId,
        target_id: input.targetUserId,
        reason: input.reason,
      }

      let reservation: AuditReservation
      try {
        reservation = await dependencies.reserveAudit({
          chat_id: input.chatId,
          actor_id: input.actorId,
          action: input.action,
          details,
          outcome: 'pending',
        })
      } catch {
        return { status: 'audit_unavailable' }
      }
      if (!reservation.ok) return { status: reservation.code === '23505' ? 'already_processed' : 'audit_unavailable' }

      let warningCount: number | undefined
      try {
        if (input.action === 'warn') {
          warningCount = await dependencies.incrementWarning(input.chatId, input.targetUserId)
        } else {
          await dependencies.applyModeration({ action: input.action, chatId: input.chatId, targetUserId: input.targetUserId })
        }
      } catch {
        const finalized = await finishAudit(reservation.id, input.chatId, 'execution_error', { ...details, error_code: 'action_execution_failed' })
        return { status: finalized ? 'action_failed' : 'audit_finalize_failed' }
      }

      let verified = false
      try {
        if (input.action === 'warn') {
          const storedWarnings = await dependencies.getWarningCount(input.chatId, input.targetUserId)
          verified = typeof warningCount === 'number' && storedWarnings !== null && storedWarnings >= warningCount
        } else {
          const member = await dependencies.getChatMember(input.chatId, input.targetUserId)
          if (input.action === 'mute') verified = member.status === 'restricted' && member.permissions?.can_send_messages === false
          else if (input.action === 'ban') verified = member.status === 'kicked'
          else if (input.action === 'kick') verified = member.status === 'left'
          else if (input.action === 'unban') verified = member.status !== 'kicked'
        }
      } catch {
        verified = false
      }

      if (!verified) {
        const finalized = await finishAudit(reservation.id, input.chatId, 'unverified', { ...details, verified: false })
        return { status: finalized ? 'state_unverified' : 'audit_finalize_failed' }
      }

      const finalized = await finishAudit(reservation.id, input.chatId, 'success', {
        ...details,
        verified: true,
        ...(warningCount === undefined ? {} : { warning_count: warningCount }),
      })
      if (!finalized) return { status: 'audit_finalize_failed' }
      return { status: 'success', auditId: reservation.id, ...(warningCount === undefined ? {} : { warningCount }) }
    } catch {
      return { status: 'service_error' }
    }
  }

  return { executeSetting, executeLanguageAction, executeMemberAction }
}
