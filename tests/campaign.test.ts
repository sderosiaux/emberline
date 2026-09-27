import { describe, it, expect } from 'vitest'
import { newCampaign, buy, upgrade, sell, isAvailable, netPrice, shipStats, tradeInValue, type Campaign } from '../src/game/campaign'
import { ITEM, ITEMS, upgradeCost, investedValue, sellValue } from '../src/data/items'

const rich = (c: Campaign, n = 1e6): Campaign => ({ ...c, credits: n })
const ok = (r: ReturnType<typeof buy>) => { if (!r.ok) throw new Error(r.reason); return r.campaign }

describe('shop economy', () => {
  it('starts with the stock loadout and some credits', () => {
    const c = newCampaign('gunship')
    expect(c.loadout.front).toEqual({ id: 'pulse', level: 1 })
    expect(c.credits).toBeGreaterThan(0)
  })

  it('buying a front gun trades in the old one at 80% of what was invested', () => {
    let c = rich(newCampaign('gunship'), 50_000)
    c = ok(upgrade(c, 'front'))
    c = ok(upgrade(c, 'front'))
    const invested = investedValue(ITEM.pulse, 3)
    expect(tradeInValue(c, 'front')).toBe(Math.floor(invested * 0.8))
    const before = c.credits
    c = ok(buy(c, 'hail', 'front'))
    expect(c.loadout.front).toEqual({ id: 'hail', level: 1 })
    expect(before - c.credits).toBe(ITEM.hail.price - Math.floor(invested * 0.8))
  })

  it('refuses purchases it cannot afford and leaves state untouched', () => {
    const c = { ...newCampaign('gunship'), credits: 10 }
    const r = buy(c, 'hail', 'front')
    expect(r.ok).toBe(false)
    expect(c.loadout.front.id).toBe('pulse')
  })

  it('upgrade costs escalate and cap at max level', () => {
    const d = ITEM.pulse
    for (let l = 1; l < d.maxLevel - 1; l++) expect(upgradeCost(d, l + 1)).toBeGreaterThan(upgradeCost(d, l))
    expect(upgradeCost(d, d.maxLevel)).toBe(Infinity)
    let c = rich(newCampaign('gunship'))
    for (let i = 1; i < d.maxLevel; i++) c = ok(upgrade(c, 'front'))
    expect(c.loadout.front.level).toBe(d.maxLevel)
    expect(upgrade(c, 'front').ok).toBe(false)
  })

  it('mandatory slots cannot be sold, optional ones refund sell value', () => {
    let c = rich(newCampaign('gunship'))
    expect(sell(c, 'front').ok).toBe(false)
    expect(sell(c, 'reactor').ok).toBe(false)
    c = ok(buy(c, 'wasp', 'podL'))
    const before = c.credits
    c = ok(sell(c, 'podL'))
    expect(c.loadout.podL).toBeNull()
    expect(c.credits - before).toBe(sellValue(ITEM.wasp, 1))
  })

  it('pods can be installed independently on both sides', () => {
    let c = rich(newCampaign('gunship'))
    c = ok(buy(c, 'wasp', 'podL'))
    c = ok(buy(c, 'wasp', 'podR'))
    expect(c.loadout.podL?.id).toBe('wasp')
    expect(c.loadout.podR?.id).toBe('wasp')
  })

  it('items only enter stock after enough missions; prototypes need their data core', () => {
    const c = newCampaign('gunship')
    expect(isAvailable(c, ITEM.sunline)).toBe(false)
    expect(isAvailable({ ...c, completed: ['a', 'b', 'c'] }, ITEM.sunline)).toBe(true)
    expect(isAvailable({ ...c, completed: ['a', 'b', 'c', 'd', 'e', 'f'] }, ITEM.chorus)).toBe(false)
    expect(isAvailable({ ...c, cores: ['core_chorus'] }, ITEM.chorus)).toBe(true)
    expect(buy(rich(c), 'chorus', 'front').ok).toBe(false)
  })

  it('wrong slot is rejected', () => {
    const c = rich(newCampaign('gunship'))
    expect(buy(c, 'wasp', 'front').ok).toBe(false)
    expect(buy(c, 'r2', 'shield').ok).toBe(false)
  })

  it('net price can be negative when downgrading to a cheaper item', () => {
    let c = rich({ ...newCampaign('gunship'), completed: ['a', 'b', 'c', 'd', 'e'] })
    c = ok(buy(c, 'r5', 'reactor'))
    expect(netPrice(c, 'r2', 'reactor')).toBeLessThan(0)
  })

  it('heavier hull trades speed for durability', () => {
    const base = newCampaign('gunship').loadout
    const heavy = { ...base, hull: 'h5' }
    expect(shipStats(heavy).hull).toBeGreaterThan(shipStats(base).hull)
    expect(shipStats(heavy).speedMul).toBeLessThan(1)
  })

  it('every item is well-formed', () => {
    for (const it of ITEMS) {
      expect(it.price).toBeGreaterThan(0)
      if (it.maxLevel > 1) expect(it.levels?.length).toBe(it.maxLevel)
      if (it.slot === 'reactor') expect(it.output! > 0 && it.capacity! > 0).toBe(true)
      if (it.slot === 'shield') expect(it.shieldCap! > 0).toBe(true)
    }
  })
})
