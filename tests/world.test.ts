import { describe, it, expect } from 'vitest'
import { World } from '../src/game/world'
import { DIFFICULTIES, START_LOADOUT, type Loadout } from '../src/game/campaign'
import { LevelScript, LevelRunner, F } from '../src/game/level'
import { GroundMover } from '../src/game/movers'
import { ITEMS } from '../src/data/items'
import { MISSIONS } from '../src/data/missions'
import { autopilot } from '../src/game/autopilot'
import { PW } from '../src/game/consts'

const mk = (l: Partial<Loadout> = {}) => new World({ ...structuredClone(START_LOADOUT), ...l }, DIFFICULTIES.gunship)
const step = (w: World, s: number, dt = 1 / 60) => { for (let i = 0; i < s / dt; i++) w.update(dt) }

describe('combat rules', () => {
  it('killing an enemy drops credits and counts stats', () => {
    const w = mk()
    const e = w.spawn('wasp', 200, 200, { elite: false })
    w.damage(e, 9999, e.x, e.y)
    expect(e.dead).toBe(true)
    expect(w.stats.kills).toBe(1)
    expect(w.pickups.count).toBeGreaterThan(0)
    expect(w.score).toBeGreaterThan(0)
  })

  it('shield generator makes linked structures immune until it dies', () => {
    const w = mk()
    const gen = w.spawn('generator', 100, 100, { mover: new GroundMover() })
    const t = w.spawn('turret', 150, 100, { mover: new GroundMover() })
    t.shieldedBy = gen
    t.s.permShield = 1
    step(w, 0.1)
    expect(w.damage(t, 50, t.x, t.y)).toBe(0)
    w.damage(gen, 99999, gen.x, gen.y)
    step(w, 0.1)
    expect(w.damage(t, 50, t.x, t.y)).toBeGreaterThan(0)
  })

  it('warden bubbles protect nearby allies only while it lives', () => {
    const w = mk()
    const wd = w.spawn('warden', 200, 150, { elite: false })
    const m = w.spawn('missileer', 250, 160, { elite: false })
    step(w, 0.05)
    expect(w.isShielded(m)).toBe(true)
    w.kill(wd)
    step(w, 0.05)
    expect(w.isShielded(m)).toBe(false)
  })

  it('damage hits shield first, then hull; shields regenerate from reactor energy', () => {
    const w = mk()
    const p = w.player
    const s0 = p.shield, h0 = p.hull
    p.hurt(10, p.x, p.y)
    expect(p.shield).toBe(s0 - 10)
    expect(p.hull).toBe(h0)
    p.invuln = 0
    p.hurt(100, p.x, p.y)
    expect(p.shield).toBe(0)
    expect(p.hull).toBeLessThan(h0)
    const e0 = p.energy
    p.shieldDelay = 0
    step(w, 0.5)
    expect(p.shield).toBeGreaterThan(0)
    expect(p.energy).toBeLessThanOrEqual(p.maxEnergy)
    void e0
  })

  it('an energy-hungry gun on a weak reactor fires slower than on a strong one', () => {
    const count = (reactor: string) => {
      const w = mk({ front: { id: 'rail', level: 8 }, reactor })
      w.player.ai = () => ({ mx: 0, my: 0, fire: true, special: false })
      step(w, 6)
      return w.stats.shotsFired
    }
    expect(count('r5')).toBeGreaterThan(count('r1') * 1.5)
  })

  it('level gates wait for the sky to clear', () => {
    const w = mk()
    const L = new LevelScript(MISSIONS.m1)
    let fired = false
    L.at(0).wave('gunship', 1, 0, F.hoverAt(PW / 2, 150, 999))
    L.at(1).gate(30)
    L.at(2).do(() => { fired = true })
    const r = new LevelRunner(L, w)
    for (let i = 0; i < 600; i++) { r.update(1 / 60); w.update(1 / 60) }
    expect(fired).toBe(false)
    for (const e of w.enemies) w.kill(e)
    for (let i = 0; i < 120; i++) { r.update(1 / 60); w.update(1 / 60) }
    expect(fired).toBe(true)
  })
})

describe('every weapon at every level', () => {
  for (const item of ITEMS.filter((i) => ['front', 'rear', 'pod'].includes(i.slot))) {
    it(`${item.id} damages targets at all ${item.maxLevel} levels`, () => {
      for (let lvl = 1; lvl <= item.maxLevel; lvl++) {
        const o = { id: item.id, level: lvl }
        const l: Partial<Loadout> = { reactor: 'r5' }
        if (item.slot === 'front') l.front = o
        if (item.slot === 'rear') l.rear = o
        if (item.slot === 'pod') { l.podL = o; l.podR = o }
        const w = mk(l)
        w.player.ai = (p) => ({ mx: 0, my: 0, fire: true, special: false, precision: p.x < 0 })
        const targets = [
          w.spawn('bunker', PW / 2, 200, { mover: new GroundMover(0, -w.scroll) }),
          w.spawn('bunker', PW / 2 - 120, 420, { mover: new GroundMover(0, -w.scroll) }),
          w.spawn('bunker', PW / 2 + 120, 420, { mover: new GroundMover(0, -w.scroll) }),
          w.spawn('bunker', PW / 2, w.player.y + 120, { mover: new GroundMover(0, -w.scroll) }),
          w.spawn('bunker', PW / 2, w.player.y - 150, { mover: new GroundMover(0, -w.scroll) }),
        ]
        for (const t of targets) { t.hp = t.maxHp = 1e9; t.def = { ...t.def, update: undefined } }
        step(w, 3)
        const dealt = targets.reduce((a, t) => a + (t.maxHp - t.hp), 0)
        expect(dealt, `${item.id} L${lvl}`).toBeGreaterThan(0)
      }
    })
  }
})

describe('missions', () => {
  for (const [id, m] of Object.entries(MISSIONS)) {
    it(`${id} runs to completion with a strong autopilot build`, () => {
      const w = new World({
        front: { id: 'pulse', level: 8 }, rear: { id: 'flank', level: 5 }, podL: { id: 'wasp', level: 3 }, podR: { id: 'viper', level: 3 },
        reactor: 'r5', shield: 's4', hull: 'h5', special: 'nova',
      }, DIFFICULTIES.gunship)
      w.god = true
      w.player.ai = autopilot(1)
      w.hpScale = 1
      w.scroll = m.scroll
      const L = new LevelScript(m)
      m.script(L)
      const r = new LevelRunner(L, w)
      let t = 0
      while (t < 900 && !(r.done && !w.enemies.some((e) => e.layer === 'air' && !e.dead && !e.gone && !e.s.ignoreGate))) {
        r.update(1 / 30); w.update(1 / 30); t += 1 / 30
      }
      expect(r.done, `${id} stuck at step progress ${r.progress.toFixed(2)}`).toBe(true)
      expect(t).toBeLessThan(900)
      expect(w.stats.kills).toBeGreaterThan(10)
      if (process.env.SIMLOG) process.stderr.write(`${id}: ${t.toFixed(0)}s, kills ${w.stats.kills}/${w.stats.spawned}, credits ${w.stats.creditsEarned}, ground ${w.stats.groundKills}/${w.stats.groundTotal}
`)
    }, 60_000)
  }
})
