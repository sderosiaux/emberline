import { describe, it, expect } from 'vitest'
import { World } from '../src/game/world'
import { DIFFICULTIES, START_LOADOUT } from '../src/game/campaign'
import { PickupKind } from '../src/game/entities'

const mk = () => {
  const w = new World(structuredClone(START_LOADOUT), DIFFICULTIES.gunship)
  w.player.invuln = 99
  w.player.entering = 0
  return w
}

describe('magnetised pickups', () => {
  it("an item circling at the magnet's natural orbit radius still gets collected", () => {
    // with "accelerate toward the ship, cap the speed" an item moving sideways at the cap
    // settles on a circle of radius ≈ speed / acceleration around the ship, forever
    const w = mk(), p = w.player
    p.x = 400; p.y = 400
    w.pickup(PickupKind.Point, p.x + 90, p.y, 10)
    const k = w.pickups.items.find((i) => i.active)!
    k.age = 1; k.magnet = true; k.vx = 0; k.vy = 720
    let t = 0
    while (k.active && t < 2) { p.x = 400; p.y = 400; w.update(1 / 60); t += 1 / 60 }
    expect(k.active).toBe(false)
    expect(t).toBeLessThan(0.6)
  })

  it('old, fast items with sideways drift reach the ship instead of orbiting it', () => {
    for (const [vx, vy] of [[900, 0], [-700, 300], [0, -900]]) {
      const w = mk(), p = w.player
      w.pickup(PickupKind.Credit, p.x + 120, p.y - 40, 10)
      const k = w.pickups.items.find((i) => i.active)!
      k.age = 12; k.magnet = true; k.vx = vx; k.vy = vy
      let t = 0
      // the ship keeps strafing, which is what used to feed the orbit
      while (k.active && t < 1.5) { p.x += Math.sin(t * 6) * 6; w.update(1 / 60); t += 1 / 60 }
      expect(k.active).toBe(false)
      expect(t).toBeLessThan(0.8)
    }
  })
})
