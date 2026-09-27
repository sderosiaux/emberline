import { describe, it, expect, beforeEach } from 'vitest'
import { newCampaign } from '../src/game/campaign'
import { applyResult, nextMissionId } from '../src/game/progress'
import { ORDER, MISSIONS } from '../src/data/missions'
import * as save from '../src/game/save'
import type { MissionResult } from '../src/game/session'

function result(id: string, extra: Partial<MissionResult> = {}): MissionResult {
  return {
    mission: MISSIONS[id], score: 1000, earned: 500, reward: 1000, bonuses: [], total: 1500, cores: [], secrets: [], warp: null, hullDamage: 0,
    stats: { kills: 10, spawned: 20, groundKills: 1, groundTotal: 2, shotsFired: 1, shotsHit: 1, damageTaken: 0, creditsEarned: 500, secrets: [], secretTexts: {}, cores: [], time: 100, maxChain: 3, bossTime: 30 },
    ...extra,
  }
}

describe('campaign progression', () => {
  it('walks the main order and finishes after the last mission', () => {
    let c = newCampaign('gunship')
    for (const id of ORDER) {
      expect(nextMissionId(c)).toBe(id)
      c = applyResult(c, result(id))
    }
    expect(c.finished).toBe(true)
    expect(nextMissionId(c)).toBeNull()
    expect(c.credits).toBe(1000 + 1500 * ORDER.length)
  })

  it('a warp inserts the secret detour, then resumes the main order', () => {
    let c = newCampaign('gunship')
    c = applyResult(c, result('m1'))
    c = applyResult(c, result('m2', { warp: 'garden' }))
    expect(nextMissionId(c)).toBe('garden')
    c = applyResult(c, result('garden', { cores: ['core_halo'] }))
    expect(nextMissionId(c)).toBe('m3')
    expect(c.cores).toContain('core_halo')
  })

  it('cores and secrets are deduplicated', () => {
    let c = newCampaign('gunship')
    c = applyResult(c, result('m1', { cores: ['core_x'], secrets: ['s'] }))
    c = applyResult(c, result('m2', { cores: ['core_x'], secrets: ['s'] }))
    expect(c.cores).toEqual(['core_x'])
    expect(c.secrets).toEqual(['s'])
  })
})

describe('save system', () => {
  let mem: Record<string, string>
  beforeEach(() => {
    mem = {}
    save.setStore({ getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v }, removeItem: (k) => { delete mem[k] } })
  })

  it('round-trips a campaign', () => {
    const c = newCampaign('warhawk')
    c.credits = 1234
    c.cores = ['core_leech']
    save.saveCampaign(c)
    expect(save.loadCampaign()).toEqual(c)
  })

  it('ignores corrupted data instead of crashing', () => {
    mem['emberline.campaign.v1'] = '{not json'
    expect(save.loadCampaign()).toBeNull()
    mem['emberline.campaign.v1'] = JSON.stringify({ version: 99 })
    expect(save.loadCampaign()).toBeNull()
  })

  it('repairs saves from older builds with unknown items', () => {
    const c = newCampaign('gunship') as unknown as Record<string, unknown>
    c.loadout = { front: { id: 'deleted_gun', level: 5 }, rear: { id: 'wasp', level: 1 }, podL: null, podR: null, reactor: 'r9', shield: 's1', hull: 'h2', special: 'nope' }
    c.detour = 'm99'
    delete c.cores
    mem['emberline.campaign.v1'] = JSON.stringify(c)
    const l = save.loadCampaign()!
    expect(l.loadout.front.id).toBe('pulse')
    expect(l.loadout.rear).toBeNull()
    expect(l.loadout.reactor).toBe('r1')
    expect(l.loadout.hull).toBe('h2')
    expect(l.loadout.special).toBe('nova')
    expect(l.detour).toBeNull()
    expect(l.cores).toEqual([])
  })

  it('settings merge over defaults and reset wipes everything', () => {
    save.saveSettings({ ...save.DEFAULT_SETTINGS, music: 0.1 })
    expect(save.loadSettings().music).toBe(0.1)
    expect(save.loadSettings().sfx).toBe(save.DEFAULT_SETTINGS.sfx)
    save.saveCampaign(newCampaign('gunship'))
    save.resetAll()
    expect(save.loadCampaign()).toBeNull()
    expect(save.loadSettings().music).toBe(save.DEFAULT_SETTINGS.music)
  })
})
