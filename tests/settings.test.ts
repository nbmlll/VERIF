import { describe, expect, it } from 'vitest'
import { messages, tr, type Language } from '@/lib/i18n'
import { defaults, normalizeSettings, updateSetting } from '@/lib/settings'

describe('group settings validation',()=>{
  it('clamps numeric thresholds to the supported range',()=>{
    const settings=normalizeSettings({moderation:{max_message_length:999999,flood_limit:0}})
    expect(settings.moderation.max_message_length).toBe(10000)
    expect(settings.moderation.flood_limit).toBe(2)
  })
  it('uses safe defaults for invalid verification modes and moderation actions',()=>{
    const settings=normalizeSettings({verification:{mode:'execute'},moderation:{keyword_action:'anything'}})
    expect(settings.verification.mode).toBe('math')
    expect(settings.moderation.keyword_action).toBe('delete')
  })
  it('defaults invalid verification triggers to member-join mode',()=>{
    expect(normalizeSettings({verification:{trigger:'anything'}}).verification.trigger).toBe('join')
    expect(updateSetting(defaults,'trigger','first_message').verification.trigger).toBe('first_message')
  })
  it('updates only the requested group setting and normalizes keyword lists',()=>{
    const next=updateSetting(defaults,'keywords',[' sale ','','free gift'])
    expect(next.moderation.keywords).toEqual(['sale','free gift'])
    expect(next.verification).toEqual(defaults.verification)
  })
  it('enables web verification when that mode is selected and falls back when disabled',()=>{
    const web=updateSetting(defaults,'mode','web')
    expect(web.verification.mode).toBe('web')
    expect(web.verification.web_enabled).toBe(true)
    const disabled=updateSetting(web,'web_enabled',false)
    expect(disabled.verification.mode).toBe('math')
  })
  it('increments message length by a constrained numeric value',()=>{
    const next=updateSetting(defaults,'max_message_length',1010)
    expect(next.moderation.max_message_length).toBe(1010)
  })
})

describe('bot translations',()=>{
  it('provides a translated value for every English bot string',()=>{
    const keys=Object.keys(messages.en).sort()
    for(const language of ['ru','zh','ar'] as Language[]) {
      expect(Object.keys(messages[language]).sort(),`${language} dictionary coverage`).toEqual(keys)
      for(const key of keys) expect(messages[language][key as keyof typeof messages.en],`${language}.${key}`).not.toBe(messages.en[key as keyof typeof messages.en])
    }
  })
  it('interpolates values without leaking the template token',()=>{
    expect(tr('en','welcome',{name:'Mina'})).toBe('Welcome, Mina!')
  })
})
