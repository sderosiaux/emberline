import { describe, it, expect } from 'vitest'
import { World } from '../src/game/world'
import { DIFFICULTIES, START_LOADOUT } from '../src/game/campaign'
import { Camera } from '../src/game/camera'
import { LevelScript, LevelRunner } from '../src/game/level'
import { canFire } from '../src/game/patterns'
import { startBoss } from '../src/game/bosses/common'
import { PW, PH } from '../src/game/consts'
import type { MissionDef } from '../src/game/level'

const mk = () => {
  const w = new World(structuredClone(START_LOADOUT), DIFFICULTIES.gunship)
  w.player.invuln = 0
  w.player.entering = 0
  return w
}
const step = (w: World, s: number, f?: () => void) => { for (let i = 0; i < s * 60; i++) { w.update(1 / 60); f?.() } }

describe('strategic pull-back camera', () => {
  it('frames exactly the playfield at rest and keeps the bottom edge anchored when wide', () => {
    const c = new Camera()
    expect(c.view()).toEqual({ x: 0, y: 0, w: PW, h: PH })
    c.reveal({ zoom: 0.5, out: 0.5, hold: 1, back: 0.5 })
    for (let i = 0; i < 40; i++) {
      c.update(1 / 60)
      const v = c.view()
      expect(v.y + v.h).toBeCloseTo(PH, 6)
      expect(v.x + v.w / 2).toBeCloseTo(PW / 2, 6)
    }
  })

  it('pulls back to the target, holds, then returns to normal framing', () => {
    const c = new Camera()
    c.reveal({ zoom: 0.5, out: 0.5, hold: 1, back: 0.5 })
    let min = 1
    for (let t = 0; t < 1.9; t += 1 / 60) { c.update(1 / 60); min = Math.min(min, c.zoom) }
    expect(min).toBeCloseTo(0.5, 3)
    c.update(0.2)
    expect(c.zoom).toBe(1)
    expect(c.busy).toBe(false)
  })

  it('enemies hold fire while the view is pulled back', () => {
    const w = mk()
    const e = w.spawn('wasp', PW / 2, 120)
    expect(canFire(w, e)).toBe(true)
    w.reveal({ zoom: 0.5, out: 0.2, hold: 1 })
    step(w, 0.4)
    expect(canFire(w, e)).toBe(false)
    step(w, 2)
    expect(canFire(w, e)).toBe(true)
  })

  it('auto-frames the furthest staged contact', () => {
    const w = mk()
    w.spawn('dart', PW / 2, -400, { mover: null })
    w.reveal({ out: 0.1, hold: 1 })
    step(w, 0.3)
    expect(w.cam.view().y).toBeLessThan(-400)
  })

  it('a horde stages above the field, pours in, and clears out on its own', () => {
    const w = mk()
    w.god = true
    const L = new LevelScript({ id: 't' } as MissionDef)
    L.at(0).horde([['dart', 10], ['wasp', 7], ['dart', 10], ['missileer', 3]]).reveal({ banner: 'Massed contacts', play: true, hold: 7 })
    const r = new LevelRunner(L, w)
    r.update(0)
    expect(w.enemies.length).toBe(30)
    expect(w.enemies.every((e) => e.y < 0 && e.y > -900)).toBe(true)
    expect(w.cam.busy).toBe(true)
    // nobody shoots while the camera is still opening
    let shotsDuringReveal = 0
    step(w, 0.8, () => { if (w.cam.calm) shotsDuringReveal += w.bullets.count })
    expect(shotsDuringReveal).toBe(0)
    step(w, 25)
    expect(w.enemies.filter((e) => !e.dead && !e.gone).length).toBe(0)
  })

  it('a playable pull-back opens the whole view to the ship, then herds it home', () => {
    const w = mk()
    const p = w.player
    w.reveal({ zoom: 0.5, out: 0.5, hold: 3, back: 1, play: true })
    step(w, 1)
    expect(w.bounds.y0).toBeLessThan(-PH * 0.9)
    expect(w.bounds.x0).toBeLessThan(-PW * 0.4)
    // fly up-left into the extended area
    p.x = -200; p.y = -300
    step(w, 0.1)
    expect(p.x).toBeLessThan(0)
    expect(p.y).toBeLessThan(0)
    step(w, 3)
    expect(p.invuln).toBeGreaterThan(0) // grace while being pushed back in
    step(w, 1)
    expect(w.cam.busy).toBe(false)
    expect(w.bounds).toEqual({ x0: 0, y0: 0, x1: PW, y1: PH })
    expect(p.x).toBeGreaterThanOrEqual(18)
    expect(p.y).toBeGreaterThanOrEqual(30)
  })

  it('enemies in the extended area fight during a playable pull-back', () => {
    const w = mk()
    w.reveal({ zoom: 0.5, out: 0.3, hold: 3, play: true })
    const e = w.spawn('wasp', -150, -200, { mover: null })
    w.player.y = 100
    step(w, 0.6)
    expect(canFire(w, e)).toBe(true)
  })

  it('every boss entrance pulls back and frames the boss', () => {
    const w = mk()
    const root = w.spawn('carrier', PW / 2, -260, { mover: null })
    startBoss(w, root, 'Test', [])
    expect(w.cam.busy).toBe(true)
    step(w, 1.2)
    expect(w.cam.view().y).toBeLessThan(root.y - root.r)
  })
})
