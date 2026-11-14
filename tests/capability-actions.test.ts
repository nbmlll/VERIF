import { describe, expect, it, vi } from 'vitest'
import { createCapabilityActionService, type CapabilityActionDependencies } from '@/lib/capability-actions'
import { defaults, type BotSettings } from '@/lib/settings'

function makeDependencies() {
  let settings: BotSettings = structuredClone(defaults)
  let language = 'en'
  let targetStatus = { status: 'member' as string, permissions: { can_send_messages: true } }
  let botStatus = { status: 'administrator', can_restrict_members: true }
  let warningCount = 0

  const dependencies: CapabilityActionDependencies = {
    getGroup: vi.fn(async () => ({ settings, language })),
    updateGroupLanguage: vi.fn(async (_chatId, nextLanguage) => { language = nextLanguage }),
    getChatMember: vi.fn(async (_chatId, userId) => {
      if (userId === 1) return { status: 'administrator' }
      if (userId === 99) return botStatus
      return targetStatus
    }),
    getBotId: vi.fn(async () => 99),
    updateGroupSettings: vi.fn(async (_chatId, nextSettings) => { settings = nextSettings }),
    reserveAudit: vi.fn(async () => ({ ok: true as const, id: 'audit-1' })),
    finalizeAudit: vi.fn(async () => true),
    incrementWarning: vi.fn(async () => { warningCount += 1; return warningCount }),
    getWarningCount: vi.fn(async () => warningCount),
    applyModeration: vi.fn(async ({ action }) => {
      if (action === 'mute') targetStatus = { status: 'restricted', permissions: { can_send_messages: false } }
      if (action === 'ban') targetStatus = { status: 'kicked', permissions: { can_send_messages: false } }
      if (action === 'kick' || action === 'unban') targetStatus = { status: 'left', permissions: { can_send_messages: true } }
    }),
  }

  return {
    service: createCapabilityActionService(dependencies),
    dependencies,
    get settings() { return settings },
    setTargetStatus(status: string) { targetStatus = { status, permissions: { can_send_messages: true } } },
    setBotStatus(status: string, canRestrictMembers = false) { botStatus = { status, can_restrict_members: canRestrictMembers } },
    setWarningCount(value: number) { warningCount = value },
  }
}

const groupContext = { chatId: -100123, actorId: 1 }

describe('group-scoped capability actions', () => {
  it('validates, audits, updates, and reads back a group setting', async () => {
    const { service, dependencies } = makeDependencies()
    const result = await service.executeSetting({
      ...groupContext,
      eventToken: 'telegram-message:-100123:44',
      action: 'set_flood_limit',
      value: '9',
    })

    expect(result.status).toBe('success')
    const storedGroup = await dependencies.getGroup(-100123)
    expect((storedGroup?.settings as BotSettings).moderation.flood_limit).toBe(9)
    expect(dependencies.reserveAudit).toHaveBeenCalledOnce()
    expect(dependencies.finalizeAudit).toHaveBeenCalledWith(
      'audit-1',
      -100123,
      'success',
      expect.objectContaining({ verified: true, setting_key: 'flood_limit' }),
    )
  })

  it('validates verification fields exposed in the private panel', async () => {
    const { service, dependencies } = makeDependencies()
    const result = await service.executeSetting({
      ...groupContext,
      eventToken: 'telegram-message:-100123:48',
      action: 'set_verification_timeout',
      value: 600,
    })

    expect(result.status).toBe('success')
    const storedGroup = await dependencies.getGroup(-100123)
    expect((storedGroup?.settings as BotSettings).verification.timeout_seconds).toBe(600)
  })

  it('audits and reads back group language changes', async () => {
    const { service, dependencies } = makeDependencies()
    const result = await service.executeLanguageAction({
      ...groupContext,
      eventToken: 'panel-callback:abcd1234',
      language: 'zh',
    })

    expect(result.status).toBe('success')
    expect((await dependencies.getGroup(-100123))?.language).toBe('zh')
    expect(dependencies.updateGroupLanguage).toHaveBeenCalledWith(-100123, 'zh')
  })

  it('rejects invalid settings before performing writes', async () => {
    const { service, dependencies } = makeDependencies()
    const result = await service.executeSetting({
      ...groupContext,
      eventToken: 'telegram-message:-100123:45',
      action: 'set_flood_limit',
      value: '1',
    })

    expect(result.status).toBe('invalid_input')
    expect(dependencies.reserveAudit).not.toHaveBeenCalled()
    expect(dependencies.updateGroupSettings).not.toHaveBeenCalled()
  })

  it('denies non-admins before recording or executing a change', async () => {
    const { service, dependencies } = makeDependencies()
    vi.mocked(dependencies.getChatMember).mockResolvedValue({ status: 'member' })
    const result = await service.executeSetting({
      ...groupContext,
      eventToken: 'telegram-message:-100123:46',
      action: 'set_flood_limit',
      value: 8,
    })

    expect(result.status).toBe('admin_required')
    expect(dependencies.reserveAudit).not.toHaveBeenCalled()
    expect(dependencies.updateGroupSettings).not.toHaveBeenCalled()
  })

  it('applies a confirmed mute only after bot permission checks and verifies Telegram state', async () => {
    const { service, dependencies } = makeDependencies()
    const result = await service.executeMemberAction({
      ...groupContext,
      targetUserId: 2,
      action: 'mute',
      confirmationToken: 'f2cc1c60-4ae9-4a0a-88cb-5a9e0cfe3f32',
      reason: 'Repeated spam',
    })

    expect(result.status).toBe('success')
    expect(dependencies.applyModeration).toHaveBeenCalledWith({ action: 'mute', chatId: -100123, targetUserId: 2 })
    expect(dependencies.finalizeAudit).toHaveBeenCalledWith(
      'audit-1',
      -100123,
      'success',
      expect.objectContaining({ verified: true, confirmation_token: 'f2cc1c60-4ae9-4a0a-88cb-5a9e0cfe3f32' }),
    )
  })

  it('refuses to moderate a group administrator', async () => {
    const { service, dependencies, setTargetStatus } = makeDependencies()
    setTargetStatus('administrator')
    const result = await service.executeMemberAction({
      ...groupContext,
      targetUserId: 2,
      action: 'ban',
      confirmationToken: 'f2cc1c60-4ae9-4a0a-88cb-5a9e0cfe3f32',
      reason: 'Test',
    })

    expect(result.status).toBe('target_is_admin')
    expect(dependencies.reserveAudit).not.toHaveBeenCalled()
    expect(dependencies.applyModeration).not.toHaveBeenCalled()
  })

  it('fails closed when VERIF lacks Telegram restriction rights', async () => {
    const { service, dependencies, setBotStatus } = makeDependencies()
    setBotStatus('administrator', false)
    const result = await service.executeMemberAction({
      ...groupContext,
      targetUserId: 2,
      action: 'kick',
      confirmationToken: 'f2cc1c60-4ae9-4a0a-88cb-5a9e0cfe3f32',
      reason: 'Test',
    })

    expect(result.status).toBe('bot_permission_missing')
    expect(dependencies.reserveAudit).not.toHaveBeenCalled()
    expect(dependencies.applyModeration).not.toHaveBeenCalled()
  })

  it('uses audit uniqueness to prevent replaying a confirmation', async () => {
    const { service, dependencies } = makeDependencies()
    vi.mocked(dependencies.reserveAudit).mockResolvedValue({ ok: false, code: '23505' })
    const result = await service.executeMemberAction({
      ...groupContext,
      targetUserId: 2,
      action: 'ban',
      confirmationToken: 'f2cc1c60-4ae9-4a0a-88cb-5a9e0cfe3f32',
      reason: 'Test',
    })

    expect(result.status).toBe('already_processed')
    expect(dependencies.applyModeration).not.toHaveBeenCalled()
  })

  it('does not report success when the audit row cannot be finalized', async () => {
    const { service, dependencies } = makeDependencies()
    vi.mocked(dependencies.finalizeAudit).mockResolvedValue(false)
    const result = await service.executeMemberAction({
      ...groupContext,
      targetUserId: 2,
      action: 'mute',
      confirmationToken: 'f2cc1c60-4ae9-4a0a-88cb-5a9e0cfe3f32',
      reason: 'Test',
    })

    expect(result.status).toBe('audit_finalize_failed')
    expect(dependencies.applyModeration).toHaveBeenCalledOnce()
  })

  it('atomically records and verifies a member warning', async () => {
    const { service, dependencies } = makeDependencies()
    const result = await service.executeMemberAction({
      ...groupContext,
      targetUserId: 2,
      action: 'warn',
      eventToken: 'telegram-message:-100123:47',
      reason: 'Repeated spam',
    })

    expect(result).toMatchObject({ status: 'success', warningCount: 1 })
    expect(dependencies.incrementWarning).toHaveBeenCalledWith(-100123, 2)
    expect(dependencies.getWarningCount).toHaveBeenCalledWith(-100123, 2)
    expect(dependencies.applyModeration).not.toHaveBeenCalled()
  })
})
