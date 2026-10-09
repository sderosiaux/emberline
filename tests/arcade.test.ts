import { describe, it, expect } from 'vitest'
import { World } from '../src/game/world'
import { DIFFICULTIES, START_LOADOUT } from '../src/game/campaign'
import { Arcade, ARCADE, newArcadeRun } from '../src/game/arcade'

const mk = () => {
  const w = new World(structuredClone(START_LOADOUT), DIFFICULTIES.gunship)
  w.arcade = new Arcade(newArcadeRun(), w)
  w.player.invuln = 0
  w.player.entering = 0
  return w
}
const step = (w: World, s: number) => { for (let i = 0; i < s * 60; i++) w.update(1 / 60) }

describe('arcade mode', () => {
  it('needs a full segment of Rift energy to flip, and drains while inside', () => {
    const w = mk(), a = w.arcade!
    a.rift = ARCADE.riftCost - 1
    a.flip(w)
    expect(a.inRift).toBe(false)
    a.rift = 100
    a.flip(w)
    expect(a.inRift).toBe(true)
    const r = a.rift
    step(w, 1)
    expect(a.rift).toBeLessThan(r)
  })

  it('is thrown back to reality when Rift energy runs out', () => {
    const w = mk(), a = w.arcade!
    a.rift = 100; a.flip(w)
    step(w, 100 / ARCADE.riftDrain + 1)
    expect(a.inRift).toBe(false)
  })

  it('bullets from the other layer pass through; same-layer ones cost a life', () => {
    const w = mk(), a = w.arcade!, p = w.player
    const lives = a.run.lives
    const b = w.fire(p.x, p.y - 1, Math.PI / 2, 1)!
    b.layer = 1
    step(w, 0.05)
    expect(a.run.lives).toBe(lives)
    w.fire(p.x, p.y - 1, Math.PI / 2, 1)
    step(w, 0.05)
    expect(a.run.lives).toBe(lives - 1)
  })

  it('grazing scores and feeds the Rift once per bullet', () => {
    const w = mk(), a = w.arcade!, p = w.player
    a.rift = 0
    w.fire(p.x + p.hitR + 10, p.y - 200, Math.PI / 2, 300)
    step(w, 1)
    expect(a.run.graze).toBe(1)
    expect(a.rift).toBeGreaterThan(0)
    expect(w.score).toBeGreaterThan(0)
  })

  it('a bomb clears bullets and grants invulnerability', () => {
    const w = mk(), a = w.arcade!, p = w.player
    for (let i = 0; i < 20; i++) w.fire(p.x + i * 10 - 100, p.y - 150, Math.PI / 2, 100)
    a.bomb(w)
    expect(w.bullets.count).toBe(0)
    expect(a.invulnerable(w)).toBe(true)
    expect(a.run.bombs).toBe(2)
  })
})

describe('arcade weapon capsules', () => {
  it('give the weapon shown at the moment of pickup, and the same weapon twice adds power', () => {
    const w = mk(), a = w.arcade!
    const shown = Arcade.capsuleWeapon(0, 0)
    a.collectWeapon(w, 0, 0, 0, 0)
    expect(a.run.weapon).toBe(shown.id)
    const later = Arcade.capsuleWeapon(0, 1.2)
    expect(later.id).not.toBe(shown.id)
    const p0 = a.run.power
    a.collectWeapon(w, 0, 1.2, 0, 0)
    a.collectWeapon(w, 0, 1.2, 0, 0)
    expect(a.run.weapon).toBe(later.id)
    expect(a.run.power).toBeGreaterThan(p0)
  })

  it('swaps the actual gun while keeping power', () => {
    const w = mk(), a = w.arcade!
    a.run.power = 2
    a.run.weapon = 'hail'
    step(w, 0.1)
    expect(w.player.front.constructor.name).toBe('Hail')
    expect(w.player.front.level).toBe(1 + Math.floor(2 * 1.75))
  })
})

import { rollCards, applyPerk, PERK } from '../src/game/perks'

describe('arcade level-up cards', () => {
  it('offers three distinct cards that can still be ranked up', () => {
    const cards = rollCards({ overcharge: 3 })
    expect(cards).toHaveLength(3)
    expect(new Set(cards.map((c) => c.id)).size).toBe(3)
    expect(cards.some((c) => c.id === 'overcharge')).toBe(false)
  })

  it('XP from kills and grazes triggers a level-up with cards', () => {
    const w = mk(), a = w.arcade!
    a.gainXp(a.run.xpNext)
    expect(a.pendingCards?.length).toBe(3)
    expect(a.run.level).toBe(2)
  })

  it('cards change the ship: pierce, damage, bombs, lives', () => {
    const w = mk(), a = w.arcade!
    for (const id of ['pierce', 'overcharge', 'echo', 'secondwind']) applyPerk(w, id)
    expect(a.run.bombs).toBe(4)
    expect(a.run.lives).toBe(4)
    a.run.power = 0
    w.player.ai = () => ({ mx: 0, my: 0, fire: true, special: false })
    step(w, 0.2)
    const s = w.shots.items.find((x) => x.active)!
    expect(s.pierce).toBeGreaterThanOrEqual(1)
    expect(s.dmg).toBeGreaterThan(7)
    expect(PERK.secondwind.max).toBe(1)
  })
})
