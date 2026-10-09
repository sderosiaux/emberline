import type { World } from './world'
import type { Enemy, Shot } from './entities'
import { createPod, createRear, shoot } from './weapons'
import { P, C } from '../render/particles'
import { explode } from './fx'
import { rand, TAU } from '../core/math'

/**
 * Arcade level-up cards (Vampire Survivors / Hades style). Kills and grazes fill an XP bar;
 * each level pauses the run and offers three cards. Ranks stack, and the cards are designed to
 * combine (ricochet × pierce, detonation × chain lightning, graze sparks × longer Rift stays).
 */
export interface PerkDef {
  id: string
  name: string
  max: number
  /** One line per rank, shown on the card for the rank you'd get. */
  text: string[]
  tag: 'gun' | 'kill' | 'graze' | 'body' | 'rift'
  rare?: boolean
}

export const PERKS: PerkDef[] = [
  { id: 'overcharge', name: 'Overcharge', max: 3, tag: 'gun', text: ['+20% shot damage', '+40% shot damage', '+60% shot damage'] },
  { id: 'rapid', name: 'Rapid Cycler', max: 3, tag: 'gun', text: ['+15% fire rate', '+30% fire rate', '+45% fire rate'] },
  { id: 'pierce', name: 'Needle Tips', max: 2, tag: 'gun', text: ['Shots pierce 1 extra target', 'Shots pierce 2 extra targets'] },
  { id: 'ricochet', name: 'Ricochet', max: 2, tag: 'gun', text: ['Shots bounce off the sides once', 'Shots bounce twice'] },
  { id: 'focuslance', name: 'Focus Lance', max: 1, tag: 'gun', text: ['While focused, shots pierce everything'] },
  { id: 'detonate', name: 'Volatile Hulls', max: 3, tag: 'kill', text: ['Kills explode (small)', 'Kills explode (medium)', 'Kills explode (large)'] },
  { id: 'chain', name: 'Arc Relay', max: 3, tag: 'kill', text: ['Kills zap 1 nearby enemy', 'Kills zap 2 nearby enemies', 'Kills zap 3 nearby enemies'] },
  { id: 'frost', name: 'Cryo Rounds', max: 2, tag: 'kill', text: ['Hits slow enemy fire', 'Hits badly slow enemy fire'] },
  { id: 'sparks', name: 'Graze Sparks', max: 3, tag: 'graze', text: ['Each graze launches a homing spark', 'Sparks hit harder', 'Two sparks per graze'] },
  { id: 'bullettime', name: 'Bullet Time', max: 1, tag: 'graze', text: ['Grazes briefly slow time'] },
  { id: 'scrap', name: 'Scrap Plating', max: 2, tag: 'graze', text: ['Every 40 grazes, absorb one hit', 'Every 25 grazes, absorb one hit'] },
  { id: 'magnet', name: 'Magnet Core', max: 2, tag: 'body', text: ['Wider item pull, +10% point value', 'Huge item pull, +20% point value'] },
  { id: 'orbital', name: 'Orbit Blades', max: 3, tag: 'body', text: ['A blade orbits you and cuts bullets', 'Bigger, faster blade', 'Second blade'] },
  { id: 'rear', name: 'Tail Guard', max: 3, tag: 'body', text: ['Rear guns', 'Rear diagonals', 'Full rear battery'] },
  { id: 'echo', name: 'Bomb Echo', max: 2, tag: 'body', text: ['+1 bomb; bombs launch 12 missiles', '+1 bomb; bombs launch 24 missiles'] },
  { id: 'riftbattery', name: 'Rift Battery', max: 2, tag: 'rift', text: ['Rift drains 30% slower', 'Rift drains 55% slower; entering clears nearby bullets'] },
  { id: 'secondwind', name: 'Second Wind', max: 1, tag: 'body', text: ['+1 life'], rare: true },
]
export const PERK: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]))

export type Mods = Record<string, number>
export const rank = (m: Mods, id: string) => m[id] ?? 0

/** Draw three distinct cards the player can still rank up; rare ones show up less. */
export function rollCards(m: Mods, rnd: () => number = Math.random): PerkDef[] {
  const pool = PERKS.filter((p) => rank(m, p.id) < p.max)
  const out: PerkDef[] = []
  while (out.length < 3 && pool.length) {
    const weights = pool.map((p) => (p.rare ? 0.35 : 1) * (rank(m, p.id) > 0 ? 1.4 : 1)) // owned cards come back more: builds deepen
    let r = rnd() * weights.reduce((a, b) => a + b, 0)
    let i = 0
    while (i < pool.length - 1 && (r -= weights[i]) > 0) i++
    out.push(pool.splice(i, 1)[0])
  }
  return out
}

/** Applied once when the card is picked (things that change the ship itself). */
export function applyPerk(w: World, id: string) {
  const a = w.arcade!
  const m = a.run.mods
  m[id] = rank(m, id) + 1
  const p = w.player
  switch (id) {
    case 'orbital': {
      p.pods = p.pods.filter((x) => x.id !== 'aegis')
      const r = m.orbital
      p.pods.push(createPod('aegis', Math.min(3, r + 1), 1, p, w))
      if (r >= 3) p.pods.push(createPod('aegis', 3, -1, p, w))
      break
    }
    case 'rear': p.rear = createRear('stinger', [1, 3, 5][m.rear - 1], p, w); break
    case 'echo': a.run.bombs++; break
    case 'secondwind': a.run.lives++; break
  }
}

/** Re-create perk-owned equipment at the start of each stage (the player object is new each stage). */
export function restorePerks(w: World, m: Mods) {
  const p = w.player
  if (rank(m, 'orbital')) { p.pods.push(createPod('aegis', Math.min(3, m.orbital + 1), 1, p, w)); if (m.orbital >= 3) p.pods.push(createPod('aegis', 3, -1, p, w)) }
  if (rank(m, 'rear')) p.rear = createRear('stinger', [1, 3, 5][m.rear - 1], p, w)
}

/** Per-shot modifiers, applied as the player's gun spawns each projectile. */
export function modShot(w: World, s: Shot) {
  const m = w.arcade!.run.mods
  s.dmg *= 1 + 0.2 * rank(m, 'overcharge')
  s.pierce += rank(m, 'pierce')
  s.ricochet += rank(m, 'ricochet')
  if (rank(m, 'focuslance') && w.player.focus) s.pierce = 99
}

export const fireRateMul = (w: World) => (w.arcade ? 1 + 0.15 * rank(w.arcade.run.mods, 'rapid') : 1)

export function onHit(w: World, e: Enemy) {
  const f = rank(w.arcade!.run.mods, 'frost')
  if (f) e.cd += 0.02 * f
}

export function onKill(w: World, e: Enemy) {
  const m = w.arcade!.run.mods
  const d = rank(m, 'detonate')
  if (d) {
    const r = [0, 40, 60, 85][d]
    w.after(0.05, () => { w.splash(e.x, e.y, r, 25 * d, null); explode(w, e.x, e.y, d >= 3 ? 'medium' : 'small', false, C.orange, true) })
  }
  const c = rank(m, 'chain')
  if (c) {
    let from = { x: e.x, y: e.y }
    const hit = new Set<number>([e.id])
    for (let i = 0; i < c; i++) {
      const t = w.nearest(from.x, from.y, 170, (o) => !hit.has(o.id))
      if (!t) break
      hit.add(t.id)
      w.line([from.x, from.y, (from.x + t.x) / 2 + rand(-10, 10), (from.y + t.y) / 2 + rand(-10, 10), t.x, t.y], '#e8fdff', '#39c8ff', 1.8, 0.12)
      w.damage(t, 30, t.x, t.y)
      from = t
    }
  }
}

export function onGraze(w: World) {
  const a = w.arcade!
  const m = a.run.mods
  const s = rank(m, 'sparks')
  const p = w.player
  if (s) {
    for (let i = 0; i < (s >= 3 ? 2 : 1); i++) {
      shoot(w, p.x, p.y - 8, -Math.PI / 2 + rand(-1.2, 1.2), 260, s >= 2 ? 14 : 9, 'shot_helix_seg', { r: 4, homing: 9, ttl: 1.6, count: false, scale: 0.6 })
    }
  }
  if (rank(m, 'bullettime')) w.hitstop = Math.max(w.hitstop, 0.06)
  const sc = rank(m, 'scrap')
  if (sc && a.run.graze % (sc >= 2 ? 25 : 40) === 0) {
    a.scrapShield = true
    w.parts.spawn(P.Ring, p.x, p.y, 0, 0, 0.4, 10, 40, C.cyan)
  }
}

export function onBomb(w: World) {
  const e = rank(w.arcade!.run.mods, 'echo')
  if (!e) return
  const p = w.player
  for (let i = 0; i < 12 * e; i++) {
    const a = (i / (12 * e)) * TAU
    shoot(w, p.x, p.y, a, 220, 40, 'shot_missile', { r: 5, homing: 7, ttl: 2.4, splash: 30, splashDmg: 20, count: false })
  }
}

export const riftDrainMul = (w: World) => [1, 0.7, 0.45][rank(w.arcade!.run.mods, 'riftbattery')]
export const magnetMul = (w: World) => [1, 1.8, 3][rank(w.arcade!.run.mods, 'magnet')]
export const pointMul = (w: World) => 1 + 0.1 * rank(w.arcade!.run.mods, 'magnet')
