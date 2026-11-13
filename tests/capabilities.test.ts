import { describe, expect, it } from 'vitest'
import {
  CAPABILITIES,
  CAPABILITY_CATEGORIES,
  getAvailableCapabilities,
  getCapabilitiesByCategory,
  getCapability,
} from '@/lib/capabilities'

describe('canonical VERIF capability registry', () => {
  it('contains exactly 102 unique capabilities across the original 16 modules', () => {
    expect(CAPABILITIES).toHaveLength(102)
    expect(CAPABILITY_CATEGORIES).toHaveLength(16)
    expect(new Set(CAPABILITIES.map(({ id }) => id)).size).toBe(102)
    expect(new Set(CAPABILITIES.map(({ toolName }) => toolName)).size).toBe(102)
    expect(new Set(CAPABILITIES.map(({ category }) => category))).toHaveLength(16)
  })

  it('provides complete metadata and valid default config for every entry', () => {
    for (const capability of CAPABILITIES) {
      expect(capability.name.length).toBeGreaterThan(0)
      expect(capability.toolName).toBe(`verif_${capability.id}`)
      expect(['low', 'medium', 'high', 'critical']).toContain(capability.risk)
      expect(['planned', 'partial', 'implemented', 'unsupported']).toContain(capability.implementationStatus)
      expect(capability.configSchema.safeParse(capability.testFixture.config).success).toBe(true)
      expect(capability.testFixture.chatId).toBeLessThan(0)
      expect(capability.testFixture.actorId).toBeGreaterThan(0)
    }
  })

  it('exposes category lookup and does not advertise partial or planned work as available', () => {
    expect(getCapability('anti_flood')?.implementationStatus).toBe('partial')
    expect(getCapabilitiesByCategory('verification').length).toBeGreaterThan(0)
    expect(getAvailableCapabilities().every(({ implementationStatus }) => implementationStatus === 'implemented')).toBe(true)
    expect(getAvailableCapabilities()).toHaveLength(0)
  })

  it('documents the Telegram limitation for account age monitoring', () => {
    const capability = getCapability('new_account_age_monitoring')
    expect(capability?.implementationStatus).toBe('unsupported')
    expect(capability?.unsupportedReason).toContain('does not expose account creation dates')
  })
})
