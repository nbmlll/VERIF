import { z } from 'zod'

export const CAPABILITY_CATEGORIES = [
  { id: 'group_protection', label: 'Group protection' },
  { id: 'ai_detection_engine', label: 'AI detection engine' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'automated_rules', label: 'Automated rules' },
  { id: 'verification', label: 'Verification' },
  { id: 'member_management', label: 'Member management' },
  { id: 'group_analytics', label: 'Group analytics' },
  { id: 'raid_protection', label: 'Raid protection' },
  { id: 'admin_alerts', label: 'Admin alerts' },
  { id: 'natural_language_administration', label: 'Natural-language administration' },
  { id: 'internationalization', label: 'Internationalization' },
  { id: 'group_specific_configuration', label: 'Group-specific configuration' },
  { id: 'permission_security', label: 'Permission and security' },
  { id: 'audit_log', label: 'Audit log' },
  { id: 'tool_action_system', label: 'Tool and action system' },
  { id: 'self_verification', label: 'Self-verification of actions' },
] as const

export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number]['id']
export type CapabilityRisk = 'low' | 'medium' | 'high' | 'critical'
export type CapabilityStatus = 'planned' | 'partial' | 'implemented' | 'unsupported'
export type TelegramPermission =
  | 'actor_is_administrator'
  | 'can_delete_messages'
  | 'can_restrict_members'
  | 'can_invite_users'
  | 'can_manage_chat'
  | 'can_change_info'

const emptyConfig = z.object({}).strict()
const detectionConfig = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(['off', 'exact', 'ai']).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
}).strict()
const moderationConfig = z.object({
  reason: z.string().trim().max(500).optional(),
  durationSeconds: z.number().int().min(1).max(30 * 24 * 60 * 60).optional(),
  threshold: z.number().int().min(1).max(100).optional(),
}).strict()
const ruleConfig = z.object({
  condition: z.string().trim().min(1).max(2000).optional(),
  actions: z.array(z.enum(['delete', 'warn', 'restrict', 'ban', 'mute', 'notify', 'verify'])).max(8).optional(),
}).strict()
const verificationConfig = z.object({
  enabled: z.boolean().optional(),
  trigger: z.enum(['join', 'first_message']).optional(),
  timeoutSeconds: z.number().int().min(30).max(3600).optional(),
  retries: z.number().int().min(0).max(10).optional(),
}).strict()
const languageConfig = z.object({ language: z.enum(['en', 'ru', 'zh', 'ar']).optional() }).strict()
const analyticsConfig = z.object({ periodHours: z.number().int().min(1).max(24 * 90).optional() }).strict()
const alertConfig = z.object({ enabled: z.boolean().optional(), destinationUserId: z.number().int().positive().optional() }).strict()

const definitions = [
  ['anti_spam', 'Anti-spam', 'group_protection'],
  ['anti_flood', 'Anti-flood', 'group_protection'],
  ['anti_raid', 'Anti-raid', 'group_protection'],
  ['anti_bot', 'Anti-bot', 'group_protection'],
  ['anti_scam', 'Anti-scam', 'group_protection'],
  ['anti_phishing_links', 'Anti-phishing links', 'group_protection'],
  ['malicious_url_detection', 'Malicious URL detection', 'group_protection'],
  ['duplicate_content_detection', 'Repeated and duplicate content detection', 'group_protection'],
  ['mass_mention_protection', 'Mass-mention protection', 'group_protection'],
  ['excessive_emoji_protection', 'Excessive-emoji protection', 'group_protection'],
  ['character_word_spam_detection', 'Character and word spam detection', 'group_protection'],
  ['advertisement_detection', 'Advertisement detection', 'group_protection'],
  ['referral_link_spam_protection', 'Referral and link spam protection', 'group_protection'],
  ['fake_giveaway_detection', 'Fake giveaway detection', 'group_protection'],

  ['spam_classifier', 'Spam classifier', 'ai_detection_engine'],
  ['scam_language_classifier', 'Scam-language classifier', 'ai_detection_engine'],
  ['social_engineering_detection', 'Social-engineering detection', 'ai_detection_engine'],
  ['phishing_impersonation_detection', 'Phishing and impersonation detection', 'ai_detection_engine'],
  ['url_reputation_check', 'Malicious URL reputation check', 'ai_detection_engine'],
  ['suspicious_account_behavior_analysis', 'Suspicious-account behavior analysis', 'ai_detection_engine'],
  ['new_account_age_monitoring', 'New-account age monitoring', 'ai_detection_engine'],
  ['raid_coordinated_account_detection', 'Raid-pattern and coordinated-account detection', 'ai_detection_engine'],
  ['repeated_scam_message_detection', 'Repeated scam-message detection', 'ai_detection_engine'],
  ['context_multilingual_confidence_scoring', 'Context-aware multilingual classification and confidence scoring', 'ai_detection_engine'],

  ['ban_user', 'Ban member', 'moderation'],
  ['unban_user', 'Unban member', 'moderation'],
  ['kick_user', 'Kick member', 'moderation'],
  ['restrict_user', 'Restrict member', 'moderation'],
  ['unrestrict_user', 'Remove member restriction', 'moderation'],
  ['temporary_ban', 'Temporary ban', 'moderation'],
  ['temporary_restriction', 'Temporary restriction', 'moderation'],
  ['warning_strike_system', 'Warning and strike system', 'moderation'],
  ['automatic_escalation', 'Automatic moderation escalation', 'moderation'],
  ['delete_message', 'Message deletion', 'moderation'],
  ['mass_moderation', 'Mass moderation', 'moderation'],

  ['automated_rule_builder', 'Automated rule builder', 'automated_rules'],
  ['message_content_triggers', 'Message-content rule triggers', 'automated_rules'],
  ['link_triggers', 'Link rule triggers', 'automated_rules'],
  ['user_behavior_triggers', 'User-behavior rule triggers', 'automated_rules'],
  ['join_leave_triggers', 'Join and leave rule triggers', 'automated_rules'],
  ['verification_failure_triggers', 'Verification-failure rule triggers', 'automated_rules'],
  ['report_triggers', 'Member-report rule triggers', 'automated_rules'],
  ['account_signal_score_triggers', 'Account-characteristic and detection-score triggers', 'automated_rules'],
  ['rule_action_pipeline', 'Rule actions: delete, warn, restrict, ban, mute, notify, or require verification', 'automated_rules'],

  ['private_verification', 'Private verification flow', 'verification'],
  ['web_captcha_verification', 'Web CAPTCHA verification', 'verification'],
  ['telegram_challenge_verification', 'Telegram-based challenge', 'verification'],
  ['verification_on_join', 'Verification on join', 'verification'],
  ['verification_on_first_message', 'Verification on first message', 'verification'],
  ['verification_timeout_retry_expiration', 'Verification timeout, retries, and expiration', 'verification'],
  ['trusted_member_verification_bypass', 'Trusted-member verification bypass', 'verification'],
  ['automatic_verification_restriction', 'Automatic restriction and unrestriction during verification', 'verification'],
  ['verification_logs_analytics', 'Verification logs and analytics', 'verification'],

  ['member_profile_lookup', 'Member profile and user information', 'member_management'],
  ['member_history_lookup', 'Member history', 'member_management'],
  ['join_date_lookup', 'Join-date lookup', 'member_management'],
  ['verification_status_lookup', 'Verification-status lookup', 'member_management'],
  ['member_warning_restriction_trust_admin_status', 'Warning, restriction, trust, and admin status', 'member_management'],
  ['member_notes', 'Member and moderator notes', 'member_management'],
  ['user_specific_rules', 'User-specific rules', 'member_management'],

  ['message_deletion_statistics', 'Message and deletion statistics', 'group_analytics'],
  ['spam_scam_phishing_statistics', 'Spam, scam, and phishing statistics', 'group_analytics'],
  ['moderation_action_statistics', 'Restriction and ban statistics', 'group_analytics'],
  ['verification_statistics', 'Verification success and failure statistics', 'group_analytics'],
  ['report_raid_statistics', 'Report and raid statistics', 'group_analytics'],
  ['detection_accuracy_feedback', 'Detection accuracy and moderator feedback', 'group_analytics'],
  ['natural_language_analytics_queries', 'Natural-language analytics queries', 'group_analytics'],

  ['join_rate_monitoring', 'Join-rate monitoring', 'raid_protection'],
  ['message_burst_detection', 'Message-rate and burst detection', 'raid_protection'],
  ['account_behavior_correlation', 'Cross-account behavior correlation', 'raid_protection'],
  ['automatic_raid_lockdown', 'Automatic lockdown and temporary verification', 'raid_protection'],
  ['raid_recovery_mode', 'Raid recovery mode', 'raid_protection'],

  ['threat_detection_alerts', 'Scam and phishing alerts', 'admin_alerts'],
  ['mass_activity_alerts', 'Raid, mass-join, and spam-wave alerts', 'admin_alerts'],
  ['verification_permission_change_alerts', 'Verification and bot-permission change alerts', 'admin_alerts'],
  ['configuration_moderation_error_alerts', 'Configuration, moderator-action, and VERIF error alerts', 'admin_alerts'],

  ['natural_language_admin_commands', 'Natural-language admin commands', 'natural_language_administration'],
  ['clarification_followup_context', 'Clarification and short follow-up context', 'natural_language_administration'],
  ['multi_group_context_resolution', 'Group and target resolution across managed groups', 'natural_language_administration'],
  ['capability_discovery_unavailable_responses', 'Capability discovery and truthful unavailable responses', 'natural_language_administration'],

  ['automatic_telegram_language_detection', 'Automatic Telegram-language detection', 'internationalization'],
  ['localized_ui_moderation_notifications', 'Localized UI, moderation, and verification notices', 'internationalization'],
  ['admin_user_language_preferences', 'Admin and user language preferences', 'internationalization'],

  ['group_scoped_settings', 'Isolated configuration for each group', 'group_specific_configuration'],
  ['protection_detection_settings', 'Protection and detection settings', 'group_specific_configuration'],
  ['verification_settings', 'Verification settings', 'group_specific_configuration'],
  ['moderation_warning_rule_settings', 'Moderation, warning, and rule settings', 'group_specific_configuration'],
  ['trusted_blocked_whitelisted_lists', 'Trusted, blocked, and whitelisted members and links', 'group_specific_configuration'],
  ['notification_language_settings', 'Notification and language settings', 'group_specific_configuration'],

  ['telegram_admin_identity_check', 'Independent Telegram administrator identity check', 'permission_security'],
  ['per_action_authorization', 'Per-action authorization', 'permission_security'],
  ['bot_permission_validation', 'VERIF bot-permission validation', 'permission_security'],
  ['risk_based_confirmation', 'Risk-based confirmation for destructive actions', 'permission_security'],
  ['cross_group_isolation', 'Cross-group data and action isolation', 'permission_security'],

  ['action_attribution_audit', 'Time, admin, group, action, target, and reason audit record', 'audit_log'],
  ['action_result_error_audit', 'Action result and error audit record', 'audit_log'],
  ['moderation_history_search', 'Moderation and audit history search', 'audit_log'],

  ['registered_tool_discovery', 'Registered capability and tool discovery', 'tool_action_system'],
  ['typed_validated_action_execution', 'Typed, validated registered-action execution', 'tool_action_system'],

  ['post_action_state_readback', 'Post-action state readback', 'self_verification'],
  ['truthful_success_failure_reporting', 'Truthful success and failure reporting', 'self_verification'],
  ['undo_reversal_tracking', 'Undo and reversal tracking where supported', 'self_verification'],
] as const satisfies readonly (readonly [string, string, CapabilityCategory])[]

const categoryRisk: Record<CapabilityCategory, CapabilityRisk> = {
  group_protection: 'medium',
  ai_detection_engine: 'medium',
  moderation: 'high',
  automated_rules: 'high',
  verification: 'medium',
  member_management: 'medium',
  group_analytics: 'low',
  raid_protection: 'high',
  admin_alerts: 'low',
  natural_language_administration: 'medium',
  internationalization: 'low',
  group_specific_configuration: 'medium',
  permission_security: 'critical',
  audit_log: 'medium',
  tool_action_system: 'high',
  self_verification: 'medium',
}

const actionPermissions: Partial<Record<string, readonly TelegramPermission[]>> = {
  ban_user: ['actor_is_administrator', 'can_restrict_members'],
  unban_user: ['actor_is_administrator', 'can_restrict_members'],
  kick_user: ['actor_is_administrator', 'can_restrict_members'],
  restrict_user: ['actor_is_administrator', 'can_restrict_members'],
  unrestrict_user: ['actor_is_administrator', 'can_restrict_members'],
  temporary_ban: ['actor_is_administrator', 'can_restrict_members'],
  temporary_restriction: ['actor_is_administrator', 'can_restrict_members'],
  delete_message: ['actor_is_administrator', 'can_delete_messages'],
  mass_moderation: ['actor_is_administrator', 'can_delete_messages', 'can_restrict_members'],
  rule_action_pipeline: ['actor_is_administrator', 'can_delete_messages', 'can_restrict_members'],
  automatic_raid_lockdown: ['actor_is_administrator', 'can_restrict_members'],
  group_scoped_settings: ['actor_is_administrator'],
  protection_detection_settings: ['actor_is_administrator'],
  verification_settings: ['actor_is_administrator', 'can_restrict_members'],
  moderation_warning_rule_settings: ['actor_is_administrator'],
  trusted_blocked_whitelisted_lists: ['actor_is_administrator'],
  notification_language_settings: ['actor_is_administrator'],
}

const destructiveIds = new Set([
  'ban_user', 'kick_user', 'temporary_ban', 'automatic_escalation', 'mass_moderation', 'rule_action_pipeline',
  'automatic_raid_lockdown',
])
const partialIds = new Set([
  'anti_spam', 'anti_flood', 'character_word_spam_detection', 'duplicate_content_detection', 'telegram_challenge_verification',
  'verification_on_join', 'verification_on_first_message', 'verification_timeout_retry_expiration',
  'automatic_verification_restriction', 'member_profile_lookup', 'warning_strike_system', 'ban_user', 'unban_user', 'kick_user', 'temporary_restriction', 'automatic_escalation',
  'delete_message', 'group_scoped_settings', 'protection_detection_settings', 'verification_settings',
  'moderation_warning_rule_settings', 'notification_language_settings', 'action_attribution_audit',
])

const schemaFor = (category: CapabilityCategory, id: string): z.ZodTypeAny => {
  if (['ban_user', 'unban_user', 'kick_user', 'restrict_user', 'unrestrict_user', 'temporary_ban', 'temporary_restriction', 'warning_strike_system'].includes(id)) return moderationConfig
  if (category === 'group_protection' || category === 'ai_detection_engine' || category === 'raid_protection') return detectionConfig
  if (category === 'automated_rules') return ruleConfig
  if (category === 'verification') return verificationConfig
  if (category === 'internationalization') return languageConfig
  if (category === 'group_analytics') return analyticsConfig
  if (category === 'admin_alerts') return alertConfig
  if (category === 'group_specific_configuration') return z.object({ settings: z.record(z.string(), z.unknown()).optional() }).strict()
  if (category === 'member_management') return z.object({ targetUserId: z.number().int().positive().optional() }).strict()
  if (category === 'natural_language_administration') return z.object({ text: z.string().trim().min(1).max(2000).optional() }).strict()
  return emptyConfig
}

const riskFor = (id: string, category: CapabilityCategory): CapabilityRisk => {
  if (destructiveIds.has(id)) return 'critical'
  if (id === 'warning_strike_system' || id === 'rule_action_pipeline') return 'high'
  return categoryRisk[category]
}

const implementationStatusFor = (id: string): CapabilityStatus => {
  if (id === 'new_account_age_monitoring') return 'unsupported'
  return partialIds.has(id) ? 'partial' : 'planned'
}

export const CAPABILITIES = Object.freeze(definitions.map(([id, name, category]) => ({
  id,
  name,
  category,
  risk: riskFor(id, category),
  requiredTelegramPermissions: actionPermissions[id] ?? [],
  configSchema: schemaFor(category, id),
  toolName: `verif_${id}`,
  implementationStatus: implementationStatusFor(id),
  ...(id === 'new_account_age_monitoring'
    ? { unsupportedReason: 'Telegram Bot API does not expose account creation dates; only group-local behavior signals can be evaluated.' }
    : {}),
  testFixture: {
    chatId: -1001234567890,
    actorId: 1001,
    targetUserId: 1002,
    messageId: 5001,
    config: {},
  },
})))

export type Capability = (typeof CAPABILITIES)[number]

export function getCapability(id: string) {
  return CAPABILITIES.find((capability) => capability.id === id)
}

export function getCapabilitiesByCategory(category: CapabilityCategory) {
  return CAPABILITIES.filter((capability) => capability.category === category)
}

export function getAvailableCapabilities() {
  return CAPABILITIES.filter((capability) => capability.implementationStatus === 'implemented')
}
